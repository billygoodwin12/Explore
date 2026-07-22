import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type Express } from "express";
import { ADDRESSES, CHAIN_ID } from "../../shared/deployments";
import type { StoredOffer } from "../../shared/types";
import { OfferStore } from "./store";
import {
  RPC_URL,
  ValidationError,
  publicClient,
  validateDeploymentMatch,
  validateOnChain,
  validateStructural,
  type IngestBody,
} from "./validate";

export function createApp(store: OfferStore = new OfferStore()): Express {
  const app = express();
  app.use(cors({ origin: "http://localhost:5173" }));
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, chainId: CHAIN_ID, midnight: ADDRESSES.midnight, ratifier: ADDRESSES.ratifier });
  });

  app.post("/api/offers", async (req, res) => {
    const body = req.body as IngestBody;
    try {
      validateStructural(body);
      validateDeploymentMatch(body);
      const { makerAuthorized, priceWad } = await validateOnChain(body);

      const stored: StoredOffer = {
        id: randomUUID(),
        marketId: body.marketId.toLowerCase(),
        offer: body.offer,
        signature: body.signature,
        root: body.root.toLowerCase(),
        digest: body.digest.toLowerCase(),
        priceWad,
        createdAt: Date.now(),
        status: "open",
        makerAuthorized,
      };
      store.add(stored);

      res.status(200).json({
        id: stored.id,
        makerAuthorized,
        priceWad,
        ...(makerAuthorized ? {} : { warning: "maker has not authorized the ratifier; offer not yet takeable" }),
      });
    } catch (e) {
      if (e instanceof ValidationError) {
        res.status(400).json({ error: e.message });
      } else {
        res.status(500).json({ error: `internal error: ${(e as Error).message}` });
      }
    }
  });

  app.get("/api/offers", (req, res) => {
    const { marketId, status } = req.query as { marketId?: string; status?: string };
    const now = Math.floor(Date.now() / 1000);
    // Lazy sweep: expired offers keep status "open" but get a computed flag (no store mutation).
    const offers = store.list({ marketId, status }).map((o) => ({
      ...o,
      expired: BigInt(o.offer.expiry) < BigInt(now),
    }));
    res.json({ offers });
  });

  app.post("/api/offers/:id/cancel", (req, res) => {
    // True cancellation is the on-chain ratifier.cancelRoot; the UI does that first.
    // The server does not verify the tx — PoC.
    const ok = store.cancel(req.params.id);
    if (!ok) {
      res.status(404).json({ error: "offer not found" });
      return;
    }
    res.json({ ok: true, txHash: (req.body as { txHash?: string } | undefined)?.txHash ?? null });
  });

  return app;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop()!);
if (isMain) {
  const port = Number(process.env.PORT ?? 8787);
  createApp().listen(port, () => {
    console.log(`midnight-rfq server on :${port} — rpc ${RPC_URL}, midnight ${ADDRESSES.midnight}`);
    publicClient.getChainId().then(
      (id) => {
        if (id !== CHAIN_ID) console.warn(`WARNING: RPC chainId ${id} != deployment chainId ${CHAIN_ID}`);
      },
      (e) => console.warn(`WARNING: RPC unreachable at boot: ${(e as Error).message?.split("\n")[0]}`),
    );
  });
}
