import type { Metadata } from "next";

import { ConnectedWalletGuard } from "@/components/manage/ConnectedWalletGuard";
import { SettingsForm } from "@/components/settings/SettingsForm";

export const metadata: Metadata = {
  title: "Settings · Theorise",
};

export default function SettingsPage() {
  return (
    <ConnectedWalletGuard
      title="Connect your wallet"
      description="Settings are tied to your wallet. Connect to view and change your preferences."
    >
      <SettingsForm />
    </ConnectedWalletGuard>
  );
}
