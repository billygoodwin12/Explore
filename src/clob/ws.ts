import WebSocket from "ws";
import { WS_URL } from "../config/index.js";
import { logger } from "../logger.js";

export type WsChannel = "market" | "user";

export interface WsSubscription {
  channel: WsChannel;
  assets?: string[];
  market?: string;
}

interface WsMessage {
  type: string;
  data: unknown;
}

type MessageHandler = (msg: WsMessage) => void;

const MAX_INSTRUMENTS_PER_SHARD = 200;

export class ClobWebSocket {
  private shards: Map<number, WebSocket> = new Map();
  private subscriptions: WsSubscription[] = [];
  private handlers: MessageHandler[] = [];
  private reconnectDelay = 1000;
  private maxReconnectDelay = 30_000;
  private closed = false;

  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  subscribe(sub: WsSubscription): void {
    this.subscriptions.push(sub);
    this.rebuildShards();
  }

  subscribeMarkets(assetIds: string[]): void {
    const chunks: string[][] = [];
    for (let i = 0; i < assetIds.length; i += MAX_INSTRUMENTS_PER_SHARD) {
      chunks.push(assetIds.slice(i, i + MAX_INSTRUMENTS_PER_SHARD));
    }

    this.subscriptions = this.subscriptions.filter(
      (s) => s.channel !== "market",
    );

    for (const chunk of chunks) {
      this.subscriptions.push({ channel: "market", assets: chunk });
    }

    this.rebuildShards();
  }

  private rebuildShards(): void {
    for (const [id, ws] of this.shards) {
      ws.close();
    }
    this.shards.clear();

    const marketSubs = this.subscriptions.filter(
      (s) => s.channel === "market",
    );
    const userSubs = this.subscriptions.filter((s) => s.channel === "user");

    let shardIdx = 0;

    for (const sub of marketSubs) {
      this.connectShard(shardIdx, [sub]);
      shardIdx++;
    }

    if (userSubs.length > 0) {
      this.connectShard(shardIdx, userSubs);
    }
  }

  private connectShard(id: number, subs: WsSubscription[]): void {
    if (this.closed) return;

    const ws = new WebSocket(WS_URL);
    this.shards.set(id, ws);

    ws.on("open", () => {
      logger.info({ shardId: id }, "WS shard connected");
      this.reconnectDelay = 1000;

      for (const sub of subs) {
        const msg: Record<string, unknown> = {
          type: "subscribe",
          channel: sub.channel,
        };
        if (sub.assets) msg.assets_id = sub.assets;
        if (sub.market) msg.market = sub.market;
        ws.send(JSON.stringify(msg));
      }
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsMessage;
        for (const handler of this.handlers) {
          handler(msg);
        }
      } catch (err) {
        logger.error({ err, shardId: id }, "WS message parse error");
      }
    });

    ws.on("close", () => {
      if (this.closed) return;
      logger.warn(
        { shardId: id, delay: this.reconnectDelay },
        "WS shard disconnected, reconnecting",
      );
      setTimeout(() => {
        this.connectShard(id, subs);
        this.reconnectDelay = Math.min(
          this.reconnectDelay * 2,
          this.maxReconnectDelay,
        );
      }, this.reconnectDelay);
    });

    ws.on("error", (err) => {
      logger.error({ err, shardId: id }, "WS shard error");
    });
  }

  close(): void {
    this.closed = true;
    for (const [, ws] of this.shards) {
      ws.close();
    }
    this.shards.clear();
  }

  getShardCount(): number {
    return this.shards.size;
  }

  isConnected(): boolean {
    for (const [, ws] of this.shards) {
      if (ws.readyState === WebSocket.OPEN) return true;
    }
    return false;
  }
}
