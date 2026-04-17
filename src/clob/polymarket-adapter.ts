import { CLOB_BASE_URL } from "../config/index.js";
import { buildL2Headers } from "./auth.js";
import {
  signOrder,
  placeOrder,
  cancelOrder,
  cancelAllOrders,
  cancelMarketOrders,
  fetchFeeRateBps,
} from "./orders.js";
import type { ClobAdapter, OrderBook, OpenOrder, } from "./adapter.js";
import type { OrderParams } from "./orders.js";
import { logger } from "../logger.js";

export class PolymarketClobAdapter implements ClobAdapter {
  async getOrderBook(tokenId: string): Promise<OrderBook> {
    const headers = buildL2Headers("GET", `/book?token_id=${tokenId}`);
    const res = await fetch(`${CLOB_BASE_URL}/book?token_id=${tokenId}`, {
      headers,
    });
    if (!res.ok) throw new Error(`Book fetch failed: ${res.status}`);

    const data = (await res.json()) as {
      bids: Array<{ price: string; size: string }>;
      asks: Array<{ price: string; size: string }>;
      timestamp: string;
    };

    return {
      bids: data.bids.map((b) => ({
        price: parseFloat(b.price),
        size: parseFloat(b.size),
      })),
      asks: data.asks.map((a) => ({
        price: parseFloat(a.price),
        size: parseFloat(a.size),
      })),
      timestamp: BigInt(data.timestamp),
    };
  }

  async getOpenOrders(market?: string): Promise<OpenOrder[]> {
    const path = market ? `/orders?market=${market}` : "/orders";
    const headers = buildL2Headers("GET", path);
    const res = await fetch(`${CLOB_BASE_URL}${path}`, { headers });
    if (!res.ok) throw new Error(`Open orders fetch failed: ${res.status}`);

    const data = (await res.json()) as Array<{
      id: string;
      client_order_id: string;
      market: string;
      asset_id: string;
      side: string;
      price: string;
      size_matched: string;
      original_size: string;
      status: string;
    }>;

    return data.map((o) => ({
      id: o.id,
      clientOrderId: o.client_order_id,
      market: o.market,
      assetId: o.asset_id,
      side: o.side === "BUY" ? (0 as const) : (1 as const),
      price: parseFloat(o.price),
      sizeMatched: parseFloat(o.size_matched),
      sizeRemaining:
        parseFloat(o.original_size) - parseFloat(o.size_matched),
      status: o.status,
    }));
  }

  async signAndPlace(
    params: OrderParams,
  ): Promise<{ clientOrderId: string; clobOrderId: string }> {
    const signed = await signOrder(params);
    const { id } = await placeOrder(signed);
    return { clientOrderId: signed.clientOrderId, clobOrderId: id };
  }

  async cancel(orderId: string): Promise<void> {
    await cancelOrder(orderId);
  }

  async cancelAll(): Promise<void> {
    await cancelAllOrders();
  }

  async cancelMarket(conditionId: string, assetId: string): Promise<void> {
    await cancelMarketOrders(conditionId, assetId);
  }

  async getFeeRateBps(tokenId: string): Promise<number> {
    return fetchFeeRateBps(tokenId);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${CLOB_BASE_URL}/ok`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
