"use client";

import Link from "next/link";

import { AccountSummaryCard } from "@/components/manage/AccountSummaryCard";
import { BecomeCreatorUpsell } from "@/components/manage/BecomeCreatorUpsell";
import { CureStatusCard } from "@/components/manage/CureStatusCard";
import { FeeSettings } from "@/components/manage/FeeSettings";
import { OpenPositionsList } from "@/components/manage/OpenPositionsList";
import { RecentFillsList } from "@/components/manage/RecentFillsList";
import { Avatar } from "@/components/primitives/Avatar";
import { useCurrentUserVault } from "@/lib/hooks/useCurrentUserVault";

export function ManageDashboard() {
  const { data: vault } = useCurrentUserVault();

  if (!vault) {
    return <BecomeCreatorUpsell />;
  }

  return (
    <main className="max-w-[1100px] mx-auto px-6 py-10 space-y-8">
      <header className="flex items-start gap-4">
        <Avatar name={vault.displayName} size="lg" />
        <div className="space-y-1 flex-1 min-w-0">
          <span className="text-label">Manage</span>
          <h1 className="text-heading-lg">{vault.displayName}</h1>
          <Link
            href={`/${vault.handle}`}
            className="num text-[13px] text-ink-3 hover:text-brand transition-colors"
          >
            @{vault.handle} → public profile
          </Link>
        </div>
      </header>

      <CureStatusCard creator={vault} />
      <AccountSummaryCard creator={vault} />
      <OpenPositionsList creator={vault} />
      <RecentFillsList creator={vault} />
      <FeeSettings creator={vault} />
    </main>
  );
}
