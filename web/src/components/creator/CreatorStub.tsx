"use client";

import { notFound } from "next/navigation";

import { Avatar } from "@/components/primitives/Avatar";
import { NumCell } from "@/components/primitives/NumCell";
import { Pill } from "@/components/primitives/Pill";
import { SkinInGamePill } from "@/components/primitives/SkinInGamePill";
import { useCreatorVault } from "@/lib/hooks/useCreatorVault";
import { formatBps } from "@/lib/formatting/money";

type CreatorStubProps = {
  handle: string;
};

export function CreatorStub({ handle }: CreatorStubProps) {
  const { data: creator } = useCreatorVault(handle);

  if (!creator) {
    notFound();
  }

  return (
    <main className="max-w-[1100px] mx-auto px-6 py-12 space-y-8">
      <header className="flex items-start gap-4">
        <Avatar name={creator.displayName} size="xl" />
        <div className="space-y-2 flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-display-md">{creator.displayName}</h1>
            <span className="num text-ink-3 text-[16px]">@{creator.handle}</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Pill tone="neutral">{creator.assetClass}</Pill>
            <SkinInGamePill
              stakeBps={creator.creatorStakeBps}
              inCure={creator.cureWindowStartedAt !== null}
            />
            <Pill tone={creator.pnl30dBps >= 0 ? "positive" : "negative"} dot>
              30d {creator.pnl30dBps >= 0 ? "+" : ""}
              {(creator.pnl30dBps / 100).toFixed(2)}%
            </Pill>
          </div>
          <p className="text-ink-2 text-[14px] max-w-prose">{creator.bio}</p>
        </div>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Stat label="NAV" value={`$${Math.round(creator.nav).toLocaleString()}`} />
        <Stat
          label="Price / share"
          value={creator.pricePerShare.toFixed(4)}
        />
        <Stat label="Creator stake" value={formatBps(creator.creatorStakeBps)} />
        <Stat label="Followers" value={creator.followCount.toLocaleString()} />
      </section>

      <section className="rounded-lg border border-dashed border-line bg-surface p-8 text-center space-y-2">
        <div className="text-label">Coming soon</div>
        <p className="text-ink-2 text-[13px]">
          Full creator page (perf chart, fee schedule, deposit / withdraw, recent
          fills) lands in a later step. Routing and live data are wired.
        </p>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4 space-y-1">
      <div className="text-label">{label}</div>
      <NumCell value={value} size="lg" />
    </div>
  );
}
