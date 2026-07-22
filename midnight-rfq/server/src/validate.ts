// Ingest validation (build spec section 3.2) — structural, deployment-match, then on-chain.
import { createPublicClient, http, isAddress, type PublicClient } from "viem";
import { offerJsonToStruct, type Address, type Hex } from "../../shared/convert";
import { ADDRESSES, CHAIN_ID, HASH_HELPER_ABI, MARKETS, MIDNIGHT_ABI, RATIFIER_ABI } from "../../shared/deployments";
import { CALLBACK_SUCCESS, encodeRatifierData, type SignatureVRS } from "../../shared/eip712";
import type { OfferJSON } from "../../shared/types";

export const RPC_URL = process.env.RPC_URL ?? "https://sepolia.base.org";

export const publicClient: PublicClient = createPublicClient({ transport: http(RPC_URL) });

const ZERO = "0x0000000000000000000000000000000000000000";

export class ValidationError extends Error {}

const isUintString = (s: unknown): s is string => typeof s === "string" && /^[0-9]+$/.test(s);
const isBytes32 = (s: unknown): s is string => typeof s === "string" && /^0x[0-9a-fA-F]{64}$/.test(s);
const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export interface IngestBody {
  marketId: string;
  offer: OfferJSON;
  signature: SignatureVRS;
  root: string;
  digest: string;
}

/// Throws ValidationError with a human-readable reason on any hard failure.
export function validateStructural(body: IngestBody): void {
  const { marketId, offer, signature, root, digest } = body ?? ({} as IngestBody);
  if (!offer || typeof offer !== "object") throw new ValidationError("missing offer");
  if (!isBytes32(marketId)) throw new ValidationError("marketId must be a 0x-prefixed bytes32");
  if (!isBytes32(root)) throw new ValidationError("root must be a 0x-prefixed bytes32");
  if (!isBytes32(digest)) throw new ValidationError("digest must be a 0x-prefixed bytes32");
  if (
    !signature ||
    typeof signature.v !== "number" ||
    ![27, 28].includes(signature.v) ||
    !isBytes32(signature.r) ||
    !isBytes32(signature.s)
  ) {
    throw new ValidationError("signature must be {v: 27|28, r: bytes32, s: bytes32}");
  }

  if (typeof offer.buy !== "boolean") throw new ValidationError("offer.buy must be boolean");
  if (typeof offer.reduceOnly !== "boolean") throw new ValidationError("offer.reduceOnly must be boolean");
  for (const f of ["maker", "callback", "receiverIfMakerIsSeller", "ratifier"] as const) {
    if (!isAddress(offer[f] ?? "", { strict: false })) throw new ValidationError(`offer.${f} must be an address`);
  }
  for (const f of ["start", "expiry", "tick", "maxUnits", "maxAssets", "continuousFeeCap"] as const) {
    if (!isUintString(offer[f])) throw new ValidationError(`offer.${f} must be a decimal uint string`);
  }
  if (!isBytes32(offer.group)) throw new ValidationError("offer.group must be a 0x-prefixed bytes32");

  if (!eq(offer.callback, ZERO)) throw new ValidationError("offer.callback must be the zero address in this build");
  if (offer.callbackData !== "0x") throw new ValidationError('offer.callbackData must be "0x" in this build');

  const unitsZero = offer.maxUnits === "0";
  const assetsZero = offer.maxAssets === "0";
  if (unitsZero === assetsZero) {
    throw new ValidationError("exactly one of maxUnits/maxAssets must be zero (InvalidOfferCaps)");
  }

  // Receiver rules (spec 0.8).
  if (offer.buy) {
    if (!eq(offer.receiverIfMakerIsSeller, ZERO)) {
      throw new ValidationError("buy offer: receiverIfMakerIsSeller must be the zero address");
    }
  } else if (eq(offer.receiverIfMakerIsSeller, ZERO)) {
    throw new ValidationError("sell offer: receiverIfMakerIsSeller must be nonzero (use the maker address)");
  }

  if (BigInt(offer.expiry) <= BigInt(Math.floor(Date.now() / 1000))) {
    throw new ValidationError("offer.expiry must be in the future");
  }
}

/// Deployment-match checks: known ratifier, midnight, chainId, and byte-for-byte market struct.
export function validateDeploymentMatch(body: IngestBody): void {
  const { marketId, offer } = body;
  if (!eq(offer.ratifier, ADDRESSES.ratifier)) {
    throw new ValidationError(`offer.ratifier must be the deployed EcrecoverRatifier (${ADDRESSES.ratifier})`);
  }
  if (!eq(offer.market.midnight, ADDRESSES.midnight)) {
    throw new ValidationError(`offer.market.midnight must be the deployed Midnight (${ADDRESSES.midnight})`);
  }
  if (offer.market.chainId !== String(CHAIN_ID)) {
    throw new ValidationError(`offer.market.chainId must be ${CHAIN_ID}`);
  }

  const known = MARKETS.find((m) => eq(m.id, marketId));
  if (!known) throw new ValidationError(`unknown marketId ${marketId}`);

  const want = known.market;
  const got = offer.market;
  const mismatch = (field: string) => new ValidationError(`offer.market.${field} does not match deployment`);
  if (got.chainId !== want.chainId) throw mismatch("chainId");
  if (!eq(got.loanToken, want.loanToken)) throw mismatch("loanToken");
  if (got.maturity !== want.maturity) throw mismatch("maturity");
  if (got.rcfThreshold !== want.rcfThreshold) throw mismatch("rcfThreshold");
  if (!eq(got.enterGate, want.enterGate)) throw mismatch("enterGate");
  if (!eq(got.liquidatorGate, want.liquidatorGate)) throw mismatch("liquidatorGate");
  if (got.collateralParams.length !== 1) throw mismatch("collateralParams.length");
  const gcp = got.collateralParams[0];
  const wcp = want.collateralParams[0];
  if (!eq(gcp.token, wcp.token)) throw mismatch("collateralParams[0].token");
  if (gcp.lltv !== wcp.lltv) throw mismatch("collateralParams[0].lltv");
  if (gcp.liquidationCursor !== wcp.liquidationCursor) throw mismatch("collateralParams[0].liquidationCursor");
  if (!eq(gcp.oracle, wcp.oracle)) throw mismatch("collateralParams[0].oracle");
}

export interface OnChainResult {
  makerAuthorized: boolean;
  priceWad: string;
}

/// On-chain checks via eth_call: hashOffer parity, live signature ratification, maker
/// authorization (soft), and the canonical tick price.
export async function validateOnChain(body: IngestBody, client: PublicClient = publicClient): Promise<OnChainResult> {
  const { offer, signature, root } = body;
  const struct = offerJsonToStruct(offer);

  const chainRoot = await client.readContract({
    address: ADDRESSES.hashHelper as Address,
    abi: HASH_HELPER_ABI,
    functionName: "hashOffer",
    args: [struct],
  });
  if (!eq(chainRoot as string, root)) {
    throw new ValidationError(`root mismatch: HashHelper.hashOffer computed ${chainRoot}, submitted ${root}`);
  }

  const ratifierData = encodeRatifierData(signature, root as Hex);
  let ratified: string;
  try {
    ratified = (await client.readContract({
      address: ADDRESSES.ratifier as Address,
      abi: RATIFIER_ABI,
      functionName: "isRatified",
      args: [struct, ratifierData, ZERO],
    })) as string;
  } catch (e) {
    throw new ValidationError(`ratifier rejected the offer: ${(e as Error).message?.split("\n")[0]}`);
  }
  if (!eq(ratified, CALLBACK_SUCCESS)) {
    throw new ValidationError("ratifier did not return CALLBACK_SUCCESS — invalid signature");
  }

  const makerAuthorized = (await client.readContract({
    address: ADDRESSES.midnight as Address,
    abi: MIDNIGHT_ABI,
    functionName: "isAuthorized",
    args: [struct.maker, ADDRESSES.ratifier as Address],
  })) as boolean;

  const priceWad = (await client.readContract({
    address: ADDRESSES.hashHelper as Address,
    abi: HASH_HELPER_ABI,
    functionName: "tickToPrice",
    args: [struct.tick],
  })) as bigint;

  return { makerAuthorized, priceWad: priceWad.toString() };
}
