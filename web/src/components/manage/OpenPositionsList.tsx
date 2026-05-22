"use client";

import { ArrowDown, ArrowUp } from "lucide-react";

import { EmptyState } from "@/components/primitives/EmptyState";
import { NumCell } from "@/components/primitives/NumCell";
import { notional, unrealizedPnl, unrealizedPnlBps } from "@/lib/formatting/positions";
import { formatRelative } from "@/lib/formatting/time";
import type { MockCreator } from "@/lib/mock/types";
import { cn } from "@/lib/utils";

export function OpenPositionsList({ creator }: { creator: MockCreator }) {
  const positions = creator.openPositions;

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-label">Open positions · {positions.length}</h2>
        <a
          href="https://app.hyperliquid.xyz/trade"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-ink-3 hover:text-ink transition-colors"
        >
          Trade on Hyperliquid →
        </a>
      </header>

      {positions.length === 0 ? (
        <EmptyState
          title="No open positions"
          description="When you open a perp on Hyperliquid from this vault, it will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {positions.map((p) => {
            const pnl = unrealizedPnl(p);
            const pnlBps = unrealizedPnlBps(p);
            const positive = pnl >= 0;
            const SideIcon = p.side === "long" ? ArrowUp : ArrowDown;
            return (
              <article
                key={p.id}
                className="rounded-lg border border-line bg-surface p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] border font-mono",
                        p.side === "long"
                          ? "bg-positive-soft-bg text-positive-soft-text border-positive/25"
                          : "bg-negative-soft-bg text-negative-soft-text border-negative/25",
                      )}
                    >
                      <SideIcon className="size-3" strokeWidth={2.5} />
                      {p.side}
                    </span>
                    <span className="text-[13px] font-medium text-ink font-mono">
                      {p.asset}
                    </span>
                    <span className="num text-[11px] text-ink-3">
                      {p.leverage}×
                    </span>
                  </div>
                  <span className="text-[11px] text-ink-3">
                    {formatRelative(p.openedAt)}
                  </span>
                </div>

                <div className="flex items-baseline justify-between">
                  <div className="space-y-0.5">
                    <div className="text-label">Unrealized P&amp;L</div>
                    <NumCell
                      value={`${positive ? "+" : ""}$${Math.round(pnl).toLocaleString()}`}
                      size="lg"
                      sentiment={positive ? "positive" : "negative"}
                    />
                    <NumCell
                      value={`${positive ? "+" : ""}${(pnlBps / 100).toFixed(2)}%`}
                      size="sm"
                      sentiment={positive ? "positive" : "negative"}
                    />
                  </div>
                  <div className="text-right space-y-0.5">
                    <div className="text-label">Notional</div>
                    <NumCell
                      value={`$${Math.round(notional(p)).toLocaleString()}`}
                      size="md"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 border-t border-line pt-2 text-[12px]">
                  <Row label="Entry" value={p.entryPrice.toFixed(2)} />
                  <Row label="Mark" value={p.markPrice.toFixed(2)} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-ink-3">{label}</span>
      <span className="num text-ink">${value}</span>
    </div>
  );
}
