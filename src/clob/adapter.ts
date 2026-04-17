import type { SignedOrder, OrderParams } from "./orders.js";

export interface OrderBook {
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  timestamp: bigint;
}

export interface OpenOrder {
  id: string;
  clientOrderId: string;
  market: string;
  assetId: string;
  side: 0 | 1;
  price: number;
  sizeMatched: number;
  sizeRemaining: number;
  status: string;
}

export interface ClobAdapter {
  getOrderBook(tokenId: string): Promise<OrderBook>;
  getOpenOrders(market?: string): Promise<OpenOrder[]>;
  signAndPlace(params: OrderParams): Promise<{ clientOrderId: string; clobOrderId: string }>;
  cancel(orderId: string): Promise<void>;
  cancelAll(): Promise<void>;
  cancelMarket(conditionId: string, assetId: string): Promise<void>;
  getFeeRateBps(tokenId: string): Promise<number>;
  healthCheck(): Promise<boolean>;
}
