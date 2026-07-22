// Revert error name -> plain-English message (build spec sections 4.4 and 7).
// This is the difference between a demo that debugs itself and one that dies on stage.
import { BaseError, ContractFunctionRevertedError } from "viem";

const MESSAGES: Record<string, string> = {
  SelfTake: "Same wallet on both sides — an offer cannot be filled by its maker. Switch to the other desk account.",
  RatifierUnauthorized:
    "The maker has not authorized the ratifier on Midnight yet (setIsAuthorized). The maker must run the Make-tab checklist.",
  RatifierFailed: "The ratifier rejected the signature — typed-data drift. Re-verify the digest before signing.",
  RootCanceled: "This offer's root was cancelled on-chain by the maker.",
  InvalidProof: "Merkle proof mismatch — the offer struct does not hash to the signed root.",
  InvalidSignature: "Signature does not recover to a valid address.",
  SellerIsLiquidatable:
    "The borrower's collateral is insufficient for this trade. Supply more collateral first, then take.",
  ConsumedUnits: "Fill exceeds the offer's remaining group budget. Re-check remaining capacity and lower the units.",
  ConsumedAssets: "Fill exceeds the offer's remaining asset budget.",
  OfferExpired: "This offer has expired.",
  OfferNotStarted: "This offer's start time is in the future.",
  TickNotAccessible: "Offer tick is not a multiple of the market's tick spacing.",
  InvalidOfferCaps: "Exactly one of maxUnits/maxAssets must be zero.",
  UnusedReceiverMustBeZero:
    "Receiver rules violated: buy offers need receiverIfMakerIsSeller = 0; sell-offer takers must pass receiverIfTakerIsSeller = 0.",
  ContinuousFeeAboveOfferCap: "The market's continuous fee exceeds this offer's cap.",
  CannotIncreaseDebtPostMaturity: "The market has matured — debt can no longer be increased.",
  InvalidChainId: "Market struct chainId does not match this chain. Rebuild from deployments.ts.",
  InvalidMidnight: "Market struct midnight address does not match the deployed singleton.",
  UnhealthyBorrower: "Withdrawal would leave the position unhealthy.",
  Unauthorized: "Not authorized for this position.",
  TakerUnauthorized: "Connected wallet is not authorized to take for this taker address.",
  MarketNotCreated: "Market has not been created on-chain.",
};

export function explainError(e: unknown): string {
  if (e instanceof BaseError) {
    const revert = e.walk((err) => err instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) {
      const name = revert.data?.errorName;
      if (name && MESSAGES[name]) return `${name}: ${MESSAGES[name]}`;
      if (name) return `Reverted: ${name}`;
    }
    // ERC20 transfer failures inside take on a buy offer usually mean the MAKER
    // lacks balance or allowance (the maker is the payer).
    if (/transfer|TRANSFER/.test(e.shortMessage ?? "")) {
      return `${e.shortMessage} — if taking a buy offer, the maker may lack loan-token balance or allowance (the maker is the payer).`;
    }
    return e.shortMessage ?? e.message;
  }
  return e instanceof Error ? e.message : String(e);
}
