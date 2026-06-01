"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { NumCell } from "@/components/primitives/NumCell";
import { Button } from "@/components/ui/button";
import { getMockStore } from "@/lib/mock/store";
import type { Hex } from "@/lib/mock/types";

export function HyperliquidBalancesCard() {
  const { address } = useAccount();
  const balances = getMockStore().getUserHyperliquidBalances(
    address as Hex | undefined,
  );

  async function onMoveIn() {
    const id = toast.loading("Moving USDC to Theorise…");
    await new Promise((r) => setTimeout(r, 1500));
    toast.success("Transfer initiated", {
      id,
      description: "Allocate to a creator vault once funds settle.",
    });
  }

  async function onWithdraw() {
    const id = toast.loading("Withdrawing to wallet…");
    await new Promise((r) => setTimeout(r, 1500));
    toast.success("Withdrawal initiated", {
      id,
      description: "USDC will arrive in your wallet shortly.",
    });
  }

  return (
    <section className="rounded-lg border border-line bg-surface p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-1.5">
          <h2 className="text-label">Your USDC on Hyperliquid</h2>
          <p className="text-[12px] text-ink-2 leading-relaxed max-w-prose">
            Your USDC lives on Hyperliquid&rsquo;s Core account, not in your
            wallet directly.{" "}
            <span className="text-ink">Spot</span> is liquid USDC ready to
            trade; <span className="text-ink">Perp</span> is USDC committed as
            margin in open positions.
          </p>
          <p className="text-[12px] text-ink-3 leading-relaxed">
            Move into Theorise to allocate to a vault, or withdraw back to your
            wallet.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 border-t border-line pt-4">
        <Cell label="Spot" value={`$${balances.spot.toFixed(2)}`} />
        <Cell label="Perp" value={`$${balances.perp.toFixed(2)}`} />
        <Cell
          label="Total available"
          value={`$${balances.totalAvailable.toFixed(2)}`}
          emphasis
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 pt-1">
        <Button variant="primary-dark" size="default" onClick={onMoveIn}>
          <ArrowDownLeft />
          Move to Theorise
        </Button>
        <Button variant="secondary" size="default" onClick={onWithdraw}>
          <ArrowUpRight />
          Withdraw to wallet
        </Button>
      </div>
    </section>
  );
}

function Cell({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="text-label">{label}</div>
      <NumCell value={value} size={emphasis ? "lg" : "md"} />
    </div>
  );
}
