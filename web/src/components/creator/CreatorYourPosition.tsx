"use client";

import { useAccount } from "wagmi";

import { NumCell } from "@/components/primitives/NumCell";
import { useUserShares } from "@/lib/hooks/useUserShares";
import type { Hex } from "@/lib/mock/types";

export function CreatorYourPosition({ creatorId }: { creatorId: Hex }) {
  const { isConnected } = useAccount();
  const { data } = useUserShares(creatorId);

  if (!isConnected) {
    return (
      <section className="rounded-lg border border-dashed border-line bg-surface p-4 sm:p-6 text-center">
        <div className="text-label">Your position</div>
        <p className="text-[13px] text-ink-2 mt-2">
          Connect a wallet to see your shares, cost basis, and unrealized P&amp;L.
        </p>
      </section>
    );
  }

  if (!data) {
    return (
      <section className="rounded-lg border border-dashed border-line bg-surface p-4 sm:p-6 text-center">
        <div className="text-label">Your position</div>
        <p className="text-[13px] text-ink-2 mt-2">
          You don’t hold any shares in this vault yet.
        </p>
      </section>
    );
  }

  const { share, currentValue, unrealizedPnl, unrealizedPnlBps } = data;
  const positive = unrealizedPnl >= 0;

  return (
    <section className="rounded-lg border border-line bg-surface p-4 sm:p-6 space-y-4">
      <div className="text-label">Your position</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Cell label="Shares" value={Math.round(share.shares).toLocaleString()} />
        <Cell
          label="Cost basis"
          value={`$${Math.round(share.costBasis).toLocaleString()}`}
        />
        <Cell
          label="Current value"
          value={`$${Math.round(currentValue).toLocaleString()}`}
        />
        <Cell
          label="Unrealized P&L"
          value={`${positive ? "+" : ""}$${Math.round(unrealizedPnl).toLocaleString()}`}
          sentiment={positive ? "positive" : "negative"}
          subValue={`${positive ? "+" : ""}${(unrealizedPnlBps / 100).toFixed(2)}%`}
        />
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
  sentiment,
  subValue,
}: {
  label: string;
  value: string;
  sentiment?: "positive" | "negative";
  subValue?: string;
}) {
  return (
    <div className="space-y-1">
      <div className="text-label">{label}</div>
      <NumCell
        value={value}
        size="lg"
        sentiment={sentiment ?? "neutral"}
      />
      {subValue ? (
        <NumCell value={subValue} size="sm" sentiment={sentiment ?? "neutral"} />
      ) : null}
    </div>
  );
}
