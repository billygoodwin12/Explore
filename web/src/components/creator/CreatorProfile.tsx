"use client";

import { Clock } from "lucide-react";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";

import { CreatorActions } from "@/components/creator/CreatorActions";
import { CreatorFees } from "@/components/creator/CreatorFees";
import { CreatorStakePanel } from "@/components/creator/CreatorStakePanel";
import { CreatorWeeklyReturns } from "@/components/creator/CreatorWeeklyReturns";
import { CreatorYourPosition } from "@/components/creator/CreatorYourPosition";
import { Avatar } from "@/components/primitives/Avatar";
import { EmptyState } from "@/components/primitives/EmptyState";
import { NumCell } from "@/components/primitives/NumCell";
import { Pill } from "@/components/primitives/Pill";
import { SkinInGamePill } from "@/components/primitives/SkinInGamePill";
import { ChartSkeleton } from "@/components/skeletons/DataSkeletons";
import { useCreatorVault } from "@/lib/hooks/useCreatorVault";
import { formatRelative } from "@/lib/formatting/time";

const ONE_DAY = 86_400_000;
const NEW_VAULT_DAYS = 7;

const CreatorChart = dynamic(
  () =>
    import("@/components/creator/CreatorChart").then((m) => ({
      default: m.CreatorChart,
    })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

export function CreatorProfile({ handle }: { handle: string }) {
  const { data: creator } = useCreatorVault(handle);

  if (!creator) {
    notFound();
  }

  const positive30d = creator.pnl30dBps >= 0;
  const positive7d = creator.pnl7dBps >= 0;
  const positiveAll = creator.pnlInceptionBps >= 0;
  const daysOld = Math.max(
    0,
    Math.floor((Date.now() - creator.joinedAt) / ONE_DAY),
  );
  const isNewVault = daysOld < NEW_VAULT_DAYS;

  return (
    <main className="max-w-[1100px] mx-auto px-6 pt-10 pb-28 sm:pb-10 space-y-8">
      <header className="flex flex-col sm:flex-row gap-6 sm:items-start">
        <Avatar name={creator.displayName} size="xl" />
        <div className="space-y-3 flex-1 min-w-0">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-display-md break-words">
              {creator.displayName}
            </h1>
            <span className="num text-ink-3 text-[16px]">
              @{creator.handle}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Pill tone="neutral">{creator.assetClass}</Pill>
            <SkinInGamePill
              stakeBps={creator.creatorStakeBps}
              inCure={creator.cureWindowStartedAt !== null}
            />
            <Pill tone={positive30d ? "positive" : "negative"} dot>
              30d {positive30d ? "+" : ""}
              {(creator.pnl30dBps / 100).toFixed(2)}%
            </Pill>
            <span className="text-[12px] text-ink-3">
              Joined {formatRelative(creator.joinedAt)}
            </span>
          </div>
          <p className="text-ink-2 text-[14px] max-w-prose leading-relaxed">
            {creator.bio}
          </p>
          <CreatorActions creator={creator} />
        </div>
      </header>

      {isNewVault ? (
        <EmptyState
          icon={Clock}
          title="Less than a week of track record"
          description={`@${creator.handle} deployed this vault ${
            daysOld === 0 ? "today" : `${daysOld} day${daysOld === 1 ? "" : "s"} ago`
          }. A few days of performance says almost nothing about a strategy. Wait for a longer history before sizing a position.`}
        />
      ) : null}

      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat
          label="NAV"
          value={`$${Math.round(creator.nav).toLocaleString()}`}
        />
        <Stat label="Price / share" value={creator.pricePerShare.toFixed(4)} />
        <Stat
          label="7d"
          value={`${positive7d ? "+" : ""}${(creator.pnl7dBps / 100).toFixed(2)}%`}
          sentiment={positive7d ? "positive" : "negative"}
        />
        <Stat
          label="30d"
          value={`${positive30d ? "+" : ""}${(creator.pnl30dBps / 100).toFixed(2)}%`}
          sentiment={positive30d ? "positive" : "negative"}
        />
        <Stat
          label="Inception"
          value={`${positiveAll ? "+" : ""}${(creator.pnlInceptionBps / 100).toFixed(2)}%`}
          sentiment={positiveAll ? "positive" : "negative"}
        />
        <Stat
          label="Win rate"
          value={`${Math.round(creator.winRate * 100)}%`}
        />
      </section>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SmallStat
          label="Depositors"
          value={creator.depositorCount.toLocaleString()}
        />
        <SmallStat
          label="Followers"
          value={creator.followCount.toLocaleString()}
        />
        <SmallStat
          label="Share supply"
          value={Math.round(creator.shareSupply).toLocaleString()}
        />
        <SmallStat
          label="Loss streak"
          value={`${creator.lossStreakWeeks}w`}
          sentiment={creator.lossStreakWeeks > 0 ? "negative" : "neutral"}
        />
      </section>

      <CreatorChart creator={creator} />
      <CreatorWeeklyReturns weekly={creator.weeklyReturns} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CreatorStakePanel creator={creator} />
        <CreatorFees creator={creator} />
      </div>

      <CreatorYourPosition creatorId={creator.id} />
    </main>
  );
}

function Stat({
  label,
  value,
  sentiment = "neutral",
}: {
  label: string;
  value: string;
  sentiment?: "neutral" | "positive" | "negative" | "brand";
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3 space-y-1">
      <div className="text-label">{label}</div>
      <NumCell value={value} size="lg" sentiment={sentiment} />
    </div>
  );
}

function SmallStat({
  label,
  value,
  sentiment = "neutral",
}: {
  label: string;
  value: string;
  sentiment?: "neutral" | "positive" | "negative" | "brand";
}) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <div className="text-label">{label}</div>
      <NumCell value={value} size="md" sentiment={sentiment} />
    </div>
  );
}
