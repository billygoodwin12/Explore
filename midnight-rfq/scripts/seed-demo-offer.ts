// Seed the book with a signed lend quote (buy offer), doing all maker prerequisites
// on-chain first: authorize ratifier, mint + approve the loan token.
// Usage: pnpm tsx scripts/seed-demo-offer.ts [privateKey] [rpcUrl] [serverUrl]
// Defaults target a local anvil rehearsal (account #1) and localhost servers.
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { offerJsonToStruct, offerStructToJson } from "../shared/convert";
import { ADDRESSES, CHAIN_ID, ERC20_ABI, HASH_HELPER_ABI, MARKETS, MIDNIGHT_ABI } from "../shared/deployments";
import { localDigest, offerTypedData, splitSignature } from "../shared/eip712";
import type { OfferJSON } from "../shared/types";

const PK = (process.argv[2] ?? "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d") as `0x${string}`;
const RPC = process.argv[3] ?? "http://127.0.0.1:8545";
const SERVER = process.argv[4] ?? "http://localhost:8787";

const account = privateKeyToAccount(PK);
const pub = createPublicClient({ transport: http(RPC) });
const wallet = createWalletClient({ account, transport: http(RPC) });

const m = MARKETS[0];
const now = Math.floor(Date.now() / 1000);

async function tx(params: Parameters<typeof wallet.writeContract>[0]) {
  const hash = await wallet.writeContract({ ...params, chain: null } as never);
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

console.log(`maker ${account.address} on ${RPC}`);
await tx({
  address: ADDRESSES.midnight as `0x${string}`,
  abi: MIDNIGHT_ABI,
  functionName: "setIsAuthorized",
  args: [ADDRESSES.ratifier, true, account.address],
} as never);
await tx({
  address: m.market.loanToken as `0x${string}`,
  abi: ERC20_ABI,
  functionName: "mint",
  args: [account.address, 100_000_000000n],
} as never);
await tx({
  address: m.market.loanToken as `0x${string}`,
  abi: ERC20_ABI,
  functionName: "approve",
  args: [ADDRESSES.midnight, 2n ** 256n - 1n],
} as never);
console.log("maker prerequisites done: authorized ratifier, minted + approved mUSDC");

const tick = (await pub.readContract({
  address: ADDRESSES.hashHelper as `0x${string}`,
  abi: HASH_HELPER_ABI,
  functionName: "priceToTick",
  args: [995_000_000_000_000_000n, 4n],
})) as bigint;

const offerJson: OfferJSON = {
  market: m.market,
  buy: true,
  maker: account.address,
  start: String(now - 300),
  expiry: String(now + 7 * 86400),
  tick: tick.toString(),
  group: "0x" + Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join(""),
  callback: "0x0000000000000000000000000000000000000000",
  callbackData: "0x",
  receiverIfMakerIsSeller: "0x0000000000000000000000000000000000000000",
  ratifier: ADDRESSES.ratifier,
  reduceOnly: false,
  maxUnits: "10000000000",
  maxAssets: "0",
  continuousFeeCap: "1000000000000000000",
};

const struct = offerJsonToStruct(offerJson);
const digest = localDigest(struct, ADDRESSES.ratifier as `0x${string}`, CHAIN_ID);
const root = (await pub.readContract({
  address: ADDRESSES.hashHelper as `0x${string}`,
  abi: HASH_HELPER_ABI,
  functionName: "hashOffer",
  args: [struct],
})) as `0x${string}`;
const sig = splitSignature(
  await account.signTypedData(offerTypedData(struct, ADDRESSES.ratifier as `0x${string}`, CHAIN_ID) as never),
);

const res = await fetch(`${SERVER}/api/offers`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ marketId: m.id, offer: offerStructToJson(struct), signature: sig, root, digest }),
});
console.log(res.status, await res.text());
