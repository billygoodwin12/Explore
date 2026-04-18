export type SignalSource = "data-api" | "on-chain";

export interface TradeSignal {
  transactionHash: string;
  whaleAddress: string;
  whaleUsername: string | null;
  timestamp: number;
  side: "BUY" | "SELL";
  conditionId: string;
  tokenId: string;
  outcome: string;
  outcomeIndex: number;
  price: number;
  size: number;
  usdcSize: number;
  marketSlug: string;
  marketTitle: string;
  marketEndDate: string | null;
  category: string;
  negRisk: boolean;
  source: SignalSource;
  detectedAt: number;
}
