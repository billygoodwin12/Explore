// RFQ server client.
import type { StoredOffer } from "@shared/types";
import type { SignatureVRS } from "@shared/eip712";
import type { OfferJSON } from "@shared/types";

const SERVER = import.meta.env.VITE_SERVER_URL ?? "http://localhost:8787";

export type ListedOffer = StoredOffer & { expired: boolean };

export async function fetchOffers(marketId: string, status = "open"): Promise<ListedOffer[]> {
  const res = await fetch(`${SERVER}/api/offers?marketId=${marketId}&status=${status}`);
  if (!res.ok) throw new Error(`server ${res.status}`);
  return (await res.json()).offers as ListedOffer[];
}

export async function postOffer(body: {
  marketId: string;
  offer: OfferJSON;
  signature: SignatureVRS;
  root: string;
  digest: string;
}): Promise<{ id: string; makerAuthorized: boolean; priceWad: string; warning?: string }> {
  const res = await fetch(`${SERVER}/api/offers`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? `server ${res.status}`);
  return json;
}

export async function cancelOffer(id: string, txHash?: string): Promise<void> {
  const res = await fetch(`${SERVER}/api/offers/${id}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ txHash }),
  });
  if (!res.ok) throw new Error(`cancel failed: ${res.status}`);
}
