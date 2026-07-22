// Offer record schema shared by server & web (build spec section 3.1).
// All numeric struct fields are decimal strings in JSON (they're uint256/uint128).

export interface CollateralParamsJSON {
  token: string;
  lltv: string;
  liquidationCursor: string;
  oracle: string;
}

export interface MarketJSON {
  chainId: string;
  midnight: string;
  loanToken: string;
  collateralParams: CollateralParamsJSON[];
  maturity: string;
  rcfThreshold: string;
  enterGate: string;
  liquidatorGate: string;
}

export interface OfferJSON {
  market: MarketJSON;
  buy: boolean;
  maker: string;
  start: string;
  expiry: string;
  tick: string;
  group: string; // 0x-prefixed bytes32
  callback: string; // "0x0000...0000" in this build
  callbackData: string; // "0x" in this build
  receiverIfMakerIsSeller: string;
  ratifier: string;
  reduceOnly: boolean;
  maxUnits: string;
  maxAssets: string;
  continuousFeeCap: string;
}

export interface StoredOffer {
  id: string; // server uuid
  marketId: string; // bytes32 midnight market id
  offer: OfferJSON;
  signature: { v: number; r: string; s: string };
  root: string; // == hashOffer(offer) for single-offer trees
  digest: string; // as computed at signing time (informational)
  priceWad: string; // tickToPrice(tick), cached at ingest
  createdAt: number;
  status: "open" | "cancelled";
  makerAuthorized?: boolean;
}
