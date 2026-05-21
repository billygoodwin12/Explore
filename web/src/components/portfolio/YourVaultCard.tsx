"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Avatar } from "@/components/primitives/Avatar";
import { NumCell } from "@/components/primitives/NumCell";
import { Pill } from "@/components/primitives/Pill";
import { SkinInGamePill } from "@/components/primitives/SkinInGamePill";
import type { MockCreator } from "@/lib/mock/types";

export function YourVaultCard({ creator }: { creator: MockCreator }) {
  const positive = creator.pnl30dBps >= 0;
  return (
    <section className="rounded-lg border border-brand/40 bg-brand-soft/40 p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <Avatar name={creator.displayName} size="lg" />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Pill tone="brand" dot>
              your vault
            </Pill>
            <SkinInGamePill
              stakeBps={creator.creatorStakeBps}
              inCure={creator.cureWindowStartedAt !== null}
            />
          </div>
          <div className="flex items-baseline gap-2 flex-wrap">
            <h2 className="text-heading-lg">{creator.displayName}</h2>
            <span className="num text-[13px] text-ink-3">
              @{creator.handle}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 pt-1">
            <div className="space-y-0.5">
              <div className="text-label">AUM</div>
              <NumCell
                value={`$${Math.round(creator.nav).toLocaleString()}`}
                size="md"
              />
            </div>
            <div className="space-y-0.5">
              <div className="text-label">30d</div>
              <NumCell
                value={`${positive ? "+" : ""}${(creator.pnl30dBps / 100).toFixed(2)}%`}
                size="md"
                sentiment={positive ? "positive" : "negative"}
              />
            </div>
            <div className="space-y-0.5">
              <div className="text-label">Depositors</div>
              <NumCell
                value={creator.depositorCount.toLocaleString()}
                size="md"
              />
            </div>
          </div>
        </div>
        <Link
          href="/manage"
          className="hidden sm:inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:text-brand transition-colors shrink-0"
        >
          Manage trading
          <ArrowRight className="size-4" />
        </Link>
      </div>
      <Link
        href="/manage"
        className="mt-4 sm:hidden flex items-center justify-center gap-1 text-[13px] font-medium text-ink"
      >
        Manage trading
        <ArrowRight className="size-4" />
      </Link>
    </section>
  );
}
