// Integration smoke test (acceptance gate 2): crafts an offer signed with a local
// throwaway private key, POSTs it, and expects the live ratifier to validate it.
// Runs against the RPC in RPC_URL (defaults to local anvil for CI; point it at
// https://sepolia.base.org after the real deployment for the live-testnet pass).
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { beforeAll, describe, expect, it } from "vitest";
import { createPublicClient, createWalletClient, http, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";

process.env.RPC_URL = process.env.RPC_URL ?? "http://127.0.0.1:8545";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "midnight-rfq-test-"));

const RPC_URL = process.env.RPC_URL;

// Anvil default account #1 — funded, used as the maker so it can send the
// setIsAuthorized transaction. Never use a real key here.
const MAKER_PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as const;

const { ADDRESSES, CHAIN_ID, HASH_HELPER_ABI, MARKETS, MIDNIGHT_ABI } = await import("../../shared/deployments");
const { offerJsonToStruct } = await import("../../shared/convert");
const { localDigest, offerTypedData, splitSignature } = await import("../../shared/eip712");
const { createApp } = await import("../src/index");
const { OfferStore } = await import("../src/store");

const account = privateKeyToAccount(MAKER_PK);
const client: PublicClient = createPublicClient({ transport: http(RPC_URL) });

let baseUrl: string;

function makeOfferJson(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const m = MARKETS[0];
  return {
    marketId: m.id,
    offer: {
      market: m.market,
      buy: true,
      maker: account.address,
      start: String(now - 300),
      expiry: String(now + 7 * 24 * 3600),
      tick: "5240",
      group: ("0x" + crypto.getRandomValues(new Uint8Array(32)).reduce((s, b) => s + b.toString(16).padStart(2, "0"), "")) as string,
      callback: "0x0000000000000000000000000000000000000000",
      callbackData: "0x",
      receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
      ratifier: ADDRESSES.ratifier,
      reduceOnly: false,
      maxUnits: "10000000000",
      maxAssets: "0",
      continuousFeeCap: "1000000000000000000",
      ...overrides,
    },
  };
}

async function signAndBuildBody(payload: ReturnType<typeof makeOfferJson>) {
  const struct = offerJsonToStruct(payload.offer as never);
  const typed = offerTypedData(struct, ADDRESSES.ratifier as `0x${string}`, CHAIN_ID);

  // MANDATORY parity gate: local viem digest must equal HashHelper.digestSingle.
  const local = localDigest(struct, ADDRESSES.ratifier as `0x${string}`, CHAIN_ID);
  const onChain = await client.readContract({
    address: ADDRESSES.hashHelper as `0x${string}`,
    abi: HASH_HELPER_ABI,
    functionName: "digestSingle",
    args: [struct, ADDRESSES.ratifier],
  });
  expect(onChain).toBe(local);

  const root = (await client.readContract({
    address: ADDRESSES.hashHelper as `0x${string}`,
    abi: HASH_HELPER_ABI,
    functionName: "hashOffer",
    args: [struct],
  })) as string;

  const sig = await account.signTypedData(typed as never);
  return { ...payload, signature: splitSignature(sig), root, digest: local };
}

async function post(path: string, body: unknown) {
  const res = await fetch(baseUrl + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
}

beforeAll(async () => {
  const app = createApp(new OfferStore(join(process.env.DATA_DIR!, "offers.json")));
  const server = app.listen(0);
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

describe("RFQ server smoke test against live chain", () => {
  it("health reports deployment", async () => {
    const res = await fetch(baseUrl + "/api/health");
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.midnight).toBe(ADDRESSES.midnight);
    expect(j.ratifier).toBe(ADDRESSES.ratifier);
  });

  it("accepts a validly signed offer (isRatified passes on-chain)", async () => {
    const body = await signAndBuildBody(makeOfferJson());
    const { status, json } = await post("/api/offers", body);
    expect(status, JSON.stringify(json)).toBe(200);
    expect(json.priceWad).toMatch(/^[0-9]+$/);
    expect(typeof json.id).toBe("string");
  });

  it("flags makerAuthorized=false before setIsAuthorized, true after", async () => {
    const before = await post("/api/offers", await signAndBuildBody(makeOfferJson()));
    expect(before.status).toBe(200);

    const authorized = (await client.readContract({
      address: ADDRESSES.midnight as `0x${string}`,
      abi: MIDNIGHT_ABI,
      functionName: "isAuthorized",
      args: [account.address, ADDRESSES.ratifier],
    })) as boolean;

    if (!authorized) {
      expect(before.json.makerAuthorized).toBe(false);
      expect(before.json.warning).toMatch(/not authorized/);
      const wallet = createWalletClient({ account, transport: http(RPC_URL) });
      const hash = await wallet.writeContract({
        address: ADDRESSES.midnight as `0x${string}`,
        abi: MIDNIGHT_ABI,
        functionName: "setIsAuthorized",
        args: [ADDRESSES.ratifier, true, account.address],
        chain: null,
      });
      await client.waitForTransactionReceipt({ hash });
    }

    const after = await post("/api/offers", await signAndBuildBody(makeOfferJson()));
    expect(after.status).toBe(200);
    expect(after.json.makerAuthorized).toBe(true);
    expect(after.json.warning).toBeUndefined();
  });

  it("rejects a tampered root", async () => {
    const body = await signAndBuildBody(makeOfferJson());
    body.root = "0x" + "00".repeat(32);
    const { status, json } = await post("/api/offers", body);
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/root mismatch/);
  });

  it("rejects receiver-rule violations", async () => {
    const bad = makeOfferJson({ receiverIfMakerIsSeller: account.address }); // buy offer must have zero receiver
    const body = await signAndBuildBody(bad);
    const { status, json } = await post("/api/offers", body);
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/receiverIfMakerIsSeller/);
  });

  it("rejects violated XOR caps", async () => {
    const bad = makeOfferJson({ maxUnits: "0", maxAssets: "0" });
    const body = await signAndBuildBody(bad);
    const { status, json } = await post("/api/offers", body);
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/maxUnits\/maxAssets/);
  });

  it("rejects a market struct that does not match the deployment", async () => {
    const payload = makeOfferJson();
    payload.offer.market = { ...payload.offer.market, rcfThreshold: "999" };
    const body = await signAndBuildBody(payload);
    const { status, json } = await post("/api/offers", body);
    expect(status).toBe(400);
    expect(String(json.error)).toMatch(/does not match deployment/);
  });

  it("lists stored offers newest-first with computed expired flag", async () => {
    const res = await fetch(`${baseUrl}/api/offers?marketId=${MARKETS[0].id}&status=open`);
    const j = await res.json();
    expect(j.offers.length).toBeGreaterThanOrEqual(3);
    expect(j.offers[0].expired).toBe(false);
    for (let i = 1; i < j.offers.length; i++) {
      expect(j.offers[i - 1].createdAt).toBeGreaterThanOrEqual(j.offers[i].createdAt);
    }
  });

  it("cancel marks an offer cancelled", async () => {
    const body = await signAndBuildBody(makeOfferJson());
    const created = await post("/api/offers", body);
    const cancelled = await post(`/api/offers/${created.json.id}/cancel`, { txHash: "0x" + "ab".repeat(32) });
    expect(cancelled.status).toBe(200);
    const res = await fetch(`${baseUrl}/api/offers?marketId=${MARKETS[0].id}&status=cancelled`);
    const j = await res.json();
    expect(j.offers.some((o: { id: string }) => o.id === created.json.id)).toBe(true);
  });
});
