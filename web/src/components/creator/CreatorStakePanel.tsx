"use client";

import { useEffect, useState } from "react";

import { formatBps } from "@/lib/formatting/money";
import { formatCountdown } from "@/lib/formatting/time";
import type { MockCreator } from "@/lib/mock/types";
import { cn } from "@/lib/utils";

const FLOOR_BPS = 500;
const CURE_WINDOW_MS = 48 * 60 * 60 * 1000;

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function CreatorStakePanel({ creator }: { creator: MockCreator }) {
  const now = useNow(1000);
  const stakeBps = creator.creatorStakeBps;
  const stakeUsdc = creator.creatorStakeUsdc;
  const inCure = creator.cureWindowStartedAt !== null;
  const cureEndsAt = creator.cureWindowStartedAt
    ? creator.cureWindowStartedAt + CURE_WINDOW_MS
    : null;
  const expired = cureEndsAt !== null && now >= cureEndsAt;

  const pct = Math.min(100, (stakeBps / (FLOOR_BPS * 2)) * 100);
  const floorPct = (FLOOR_BPS / (FLOOR_BPS * 2)) * 100;
  const tone = inCure
    ? "negative"
    : stakeBps < FLOOR_BPS + 50
      ? "warning"
      : "positive";

  return (
    <section className="rounded-lg border border-line bg-surface p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-label">Creator stake</div>
        {inCure ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-negative/30 bg-negative/10 px-2 py-0.5 text-[11px] font-medium text-negative">
            <span className="size-1.5 rounded-full bg-negative animate-pulse" />
            {expired ? "cure expired" : "in cure"}
          </span>
        ) : null}
      </div>

      <div className="flex items-baseline gap-3 flex-wrap">
        <div className="num text-display-md text-ink">{formatBps(stakeBps)}</div>
        <div className="num text-[14px] text-ink-3">
          ${Math.round(stakeUsdc).toLocaleString()}
        </div>
      </div>

      <div className="space-y-2">
        <div className="relative h-2 rounded-full bg-surface-2 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full",
              tone === "negative" && "bg-negative",
              tone === "warning" && "bg-warning",
              tone === "positive" && "bg-positive",
            )}
            style={{ width: `${pct}%` }}
          />
          <div
            className="absolute top-0 bottom-0 w-px bg-ink"
            style={{ left: `${floorPct}%` }}
            aria-label="5% floor"
          />
        </div>
        <div className="flex items-center justify-between text-[11px] text-ink-3 num">
          <span>0%</span>
          <span>5% floor</span>
          <span>10%+</span>
        </div>
      </div>

      {inCure && cureEndsAt !== null ? (
        <div className="rounded-md border border-negative/30 bg-negative/5 p-3 space-y-1.5">
          <div className="text-label !text-negative">
            Cure window · 48h to top up
          </div>
          <div className="num text-heading-md text-ink">
            {expired ? "expired" : formatCountdown(cureEndsAt, now)}
          </div>
          <p className="text-[12px] text-ink-2 leading-relaxed">
            Creator must raise stake to ≥ 5% of NAV before the timer ends. If
            not, the vault auto-dissolves and depositors are refunded pro-rata.
          </p>
        </div>
      ) : (
        <p className="text-[12px] text-ink-2 leading-relaxed">
          Stake is locked alongside depositors’ capital. If it drops below 5%
          of NAV, a 48-hour cure window opens.
        </p>
      )}
    </section>
  );
}
