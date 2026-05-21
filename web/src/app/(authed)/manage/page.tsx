import type { Metadata } from "next";

import { ManageDashboard } from "@/components/manage/ManageDashboard";
import { ConnectedWalletGuard } from "@/components/manage/ConnectedWalletGuard";

export const metadata: Metadata = {
  title: "Manage · Theorise",
};

export default function ManagePage() {
  return (
    <ConnectedWalletGuard
      title="Connect your wallet"
      description="This page is for creators. Connect the wallet that controls your vault to manage stake, fees, and view your open positions."
    >
      <ManageDashboard />
    </ConnectedWalletGuard>
  );
}
