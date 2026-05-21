import type { Metadata } from "next";

import { ConnectedWalletGuard } from "@/components/manage/ConnectedWalletGuard";
import { PortfolioDashboard } from "@/components/portfolio/PortfolioDashboard";

export const metadata: Metadata = {
  title: "Portfolio · Theorise",
};

export default function PortfolioPage() {
  return (
    <ConnectedWalletGuard
      title="Connect your wallet"
      description="Connect your wallet to see your positions, P&L, and USDC balances across Theorise and Hyperliquid."
    >
      <PortfolioDashboard />
    </ConnectedWalletGuard>
  );
}
