"use client";

import { useAccount } from "wagmi";

import { NumCell } from "@/components/primitives/NumCell";
import { Pill } from "@/components/primitives/Pill";
import { formatBps } from "@/lib/formatting/money";
import { getMockStore } from "@/lib/mock/store";
import type { Hex, MockCreator } from "@/lib/mock/types";

const FLOOR_BPS = 500;

export function AccountSummaryCard({ creator }: { creator: MockCreator }) {
  const { address } = useAccount();
  const usdcBalance = getMockStore().getUserUsdcBalance(address as Hex | undefined);
  const inCure = creator.cureWindowStartedAt !== null;
  const aboveFloor = creator.creatorStakeBps >= FLOOR_BPS;

  return (
    <section className="rounded-lg border border-line bg-surface p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-label">Account summary</div>
        {inCure ? (
          <Pill tone="negative" dot>
            in cure
          </Pill>
        ) : aboveFloor ? (
          <Pill tone="positive" dot>
            ≥ 5% healthy
          </Pill>
        ) : (
          <Pill tone="warning" dot>
            below floor
          </Pill>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Cell
          label="AUM"
          value={`$${Math.round(creator.nav).toLocaleString()}`}
        />
        <Cell
          label="Your stake"
          value={`$${Math.round(creator.creatorStakeUsdc).toLocaleString()}`}
          sub={`${formatBps(creator.creatorStakeBps)} of NAV`}
        />
        <Cell
          label="Available USDC"
          value={`$${usdcBalance.toFixed(2)}`}
          sub="In your wallet"
        />
        <Cell
          label="Floor status"
          value={`${formatBps(FLOOR_BPS)} required`}
          sub={aboveFloor ? "Above floor" : "Top up to clear cure"}
        />
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-label">{label}</div>
      <NumCell value={value} size="lg" />
      {sub ? <div className="text-[11px] text-ink-3">{sub}</div> : null}
    </div>
  );
}
