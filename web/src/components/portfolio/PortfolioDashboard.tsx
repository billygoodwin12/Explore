"use client";

import { useAccount } from "wagmi";

import { HoldingsTable } from "@/components/portfolio/HoldingsTable";
import { HyperliquidBalancesCard } from "@/components/portfolio/HyperliquidBalancesCard";
import { PortfolioStatsCard } from "@/components/portfolio/PortfolioStatsCard";
import { YourVaultCard } from "@/components/portfolio/YourVaultCard";
import { useCurrentUserVault } from "@/lib/hooks/useCurrentUserVault";
import { useUserHoldings } from "@/lib/hooks/useUserHoldings";
import { getMockStore } from "@/lib/mock/store";
import type { Hex } from "@/lib/mock/types";

export function PortfolioDashboard() {
  const { address } = useAccount();
  const { data: holdings = [] } = useUserHoldings();
  const { data: ownVault } = useCurrentUserVault();

  const availableUsdc = getMockStore().getUserUsdcBalance(
    address as Hex | undefined,
  );
  const invested = holdings.reduce((sum, h) => sum + h.currentValue, 0);
  const totalBasis = holdings.reduce((sum, h) => sum + h.share.costBasis, 0);
  const unrealizedPnl = invested - totalBasis;
  const pnl30dDollars = holdings.reduce(
    (sum, h) => sum + h.currentValue * (h.creator.pnl30dBps / 10_000),
    0,
  );
  const pnl30dBps =
    invested > 0 ? Math.round((pnl30dDollars / invested) * 10_000) : 0;
  const pnl30dPositive = pnl30dBps >= 0;
  const unrealizedPositive = unrealizedPnl >= 0;

  return (
    <main className="max-w-[1100px] mx-auto px-6 py-10 space-y-8">
      <header className="space-y-1">
        <span className="text-label">Portfolio</span>
        <h1 className="text-heading-lg">Your positions</h1>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <PortfolioStatsCard
          id="available"
          label="Available USDC"
          value={`$${availableUsdc.toFixed(2)}`}
          sub="In your wallet"
        />
        <PortfolioStatsCard
          id="invested"
          label="Invested"
          value={`$${Math.round(invested).toLocaleString()}`}
          sub={`${holdings.length} ${holdings.length === 1 ? "vault" : "vaults"}`}
        />
        <PortfolioStatsCard
          id="pnl30d"
          label="Net P&L · 30d"
          value={`${pnl30dPositive ? "+" : ""}$${Math.abs(Math.round(pnl30dDollars)).toLocaleString()}`}
          sentiment={pnl30dPositive ? "positive" : "negative"}
          sub={`${unrealizedPositive ? "+" : ""}${(pnl30dBps / 100).toFixed(2)}% weighted`}
          subSentiment={pnl30dPositive ? "positive" : "negative"}
        />
      </section>

      {ownVault ? <YourVaultCard creator={ownVault} /> : null}

      <HoldingsTable holdings={holdings} />

      <HyperliquidBalancesCard />
    </main>
  );
}
