// EIP-712 typed data for the EcrecoverRatifier (build spec section 4.3 — VERBATIM semantics),
// plus ratifierData encoding for single-offer (height-0) trees.
import { encodeAbiParameters, hashTypedData, keccak256, toBytes } from "viem";
import type { Address, Hex, OfferStruct } from "./convert";

export const CALLBACK_SUCCESS: Hex = keccak256(toBytes("morpho.midnight.callbackSuccess"));

export const OFFER_TYPES = {
  EIP712Domain: [
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  OfferTree: [{ name: "offerTree", type: "Offer" }],
  Offer: [
    { name: "market", type: "Market" },
    { name: "buy", type: "bool" },
    { name: "maker", type: "address" },
    { name: "start", type: "uint256" },
    { name: "expiry", type: "uint256" },
    { name: "tick", type: "uint256" },
    { name: "group", type: "bytes32" },
    { name: "callback", type: "address" },
    { name: "callbackData", type: "bytes" },
    { name: "receiverIfMakerIsSeller", type: "address" },
    { name: "ratifier", type: "address" },
    { name: "reduceOnly", type: "bool" },
    { name: "maxUnits", type: "uint128" },
    { name: "maxAssets", type: "uint128" },
    { name: "continuousFeeCap", type: "uint256" },
  ],
  Market: [
    { name: "chainId", type: "uint256" },
    { name: "midnight", type: "address" },
    { name: "loanToken", type: "address" },
    { name: "collateralParams", type: "CollateralParams[]" },
    { name: "maturity", type: "uint256" },
    { name: "rcfThreshold", type: "uint256" },
    { name: "enterGate", type: "address" },
    { name: "liquidatorGate", type: "address" },
  ],
  CollateralParams: [
    { name: "token", type: "address" },
    { name: "lltv", type: "uint256" },
    { name: "liquidationCursor", type: "uint256" },
    { name: "oracle", type: "address" },
  ],
} as const;

/// Domain has NO name, NO version, NO salt. verifyingContract = the RATIFIER (not Midnight).
export function offerTypedData(offer: OfferStruct, ratifier: Address, chainId: number) {
  return {
    domain: { chainId: BigInt(chainId), verifyingContract: ratifier },
    types: OFFER_TYPES,
    primaryType: "OfferTree" as const,
    message: { offerTree: offer },
  };
}

/// Local (viem) computation of the signing digest for a single-offer tree.
export function localDigest(offer: OfferStruct, ratifier: Address, chainId: number): Hex {
  return hashTypedData(offerTypedData(offer, ratifier, chainId) as Parameters<typeof hashTypedData>[0]);
}

export interface SignatureVRS {
  v: number;
  r: Hex;
  s: Hex;
}

/// Split a 65-byte signature; normalize v to 27/28.
export function splitSignature(sig: Hex): SignatureVRS {
  const r = ("0x" + sig.slice(2, 66)) as Hex;
  const s = ("0x" + sig.slice(66, 130)) as Hex;
  let v = parseInt(sig.slice(130, 132), 16);
  if (v < 27) v += 27;
  return { v, r, s };
}

/// abi.encode(Signature{v,r,s}, bytes32 root, uint256 leafIndex, bytes32[] proof)
/// — the tuple must be encoded as a struct, matching the ratifier's abi.decode.
export function encodeRatifierData(sig: SignatureVRS, root: Hex): Hex {
  return encodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "v", type: "uint8" },
          { name: "r", type: "bytes32" },
          { name: "s", type: "bytes32" },
        ],
      },
      { type: "bytes32" },
      { type: "uint256" },
      { type: "bytes32[]" },
    ],
    [{ v: sig.v, r: sig.r, s: sig.s }, root, 0n, []],
  );
}
