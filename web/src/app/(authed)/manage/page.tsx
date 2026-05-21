import type { Metadata } from "next";

import { ManageDashboard } from "@/components/manage/ManageDashboard";
import { ConnectedWalletGuard } from "@/components/manage/ConnectedWalletGuard";

export const metadata: Metadata = {
  title: "Manage · Theorise",
};

export default function ManagePage() {
  return (
    <ConnectedWalletGuard>
      <ManageDashboard />
    </ConnectedWalletGuard>
  );
}
