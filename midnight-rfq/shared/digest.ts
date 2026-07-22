// MANDATORY parity gate (spec 4.3): before requesting a wallet signature, the locally
// computed EIP-712 digest must equal HashHelper.digestSingle from an eth_call.
// This single check eliminates the entire class of silent hashing bugs.
import type { Address, Hex, OfferStruct } from "./convert";
import { localDigest } from "./eip712";

export class DigestMismatchError extends Error {
  constructor(
    public readonly local: Hex,
    public readonly onChain: Hex,
  ) {
    super(`typed-data mismatch — do not sign (local ${local} != on-chain ${onChain})`);
  }
}

/// Returns the verified digest, or throws DigestMismatchError.
/// `readChainDigest` performs the HashHelper.digestSingle(offer, ratifier) eth_call.
export async function assertDigestParity(
  offer: OfferStruct,
  ratifier: Address,
  chainId: number,
  readChainDigest: (offer: OfferStruct, ratifier: Address) => Promise<Hex>,
): Promise<Hex> {
  const local = localDigest(offer, ratifier, chainId);
  const onChain = await readChainDigest(offer, ratifier);
  if (local.toLowerCase() !== onChain.toLowerCase()) throw new DigestMismatchError(local, onChain);
  return local;
}
