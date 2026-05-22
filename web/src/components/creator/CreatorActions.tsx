"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { ArrowDownToLine, ArrowUpFromLine, Star } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import { useFollowedCreators } from "@/lib/hooks/useFollowedCreators";
import { useUserShares } from "@/lib/hooks/useUserShares";
import type { MockCreator } from "@/lib/mock/types";
import { cn } from "@/lib/utils";

const DepositModal = dynamic(() =>
  import("@/components/transactions/DepositModal").then((m) => ({
    default: m.DepositModal,
  })),
);
const WithdrawModal = dynamic(() =>
  import("@/components/transactions/WithdrawModal").then((m) => ({
    default: m.WithdrawModal,
  })),
);

export function CreatorActions({ creator }: { creator: MockCreator }) {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { data: followed = [], follow, unfollow } = useFollowedCreators();
  const { data: position } = useUserShares(creator.id);
  const isFollowing = followed.some((c) => c.id === creator.id);
  const hasPosition = Boolean(position);

  const [depositOpen, setDepositOpen] = useState(false);
  const [depositMounted, setDepositMounted] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawMounted, setWithdrawMounted] = useState(false);

  function onToggleFollow() {
    if (!isConnected) {
      toast.error("Connect a wallet to follow creators.");
      return;
    }
    if (isFollowing) {
      unfollow(creator.id);
      toast(`Unfollowed @${creator.handle}`);
    } else {
      follow(creator.id);
      toast(`Following @${creator.handle}`);
    }
  }

  function onDeposit() {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    setDepositMounted(true);
    setDepositOpen(true);
  }

  function onWithdraw() {
    setWithdrawMounted(true);
    setWithdrawOpen(true);
  }

  const followBtn = (compact: boolean) => (
    <Button
      variant={isFollowing ? "secondary" : "ghost"}
      size="default"
      onClick={onToggleFollow}
      className={compact ? "shrink-0" : undefined}
      aria-label={isFollowing ? "Unfollow" : "Follow"}
    >
      <Star
        className={cn("size-4", isFollowing && "fill-brand text-brand")}
        strokeWidth={1.75}
      />
      {compact ? null : isFollowing ? "Following" : "Follow"}
    </Button>
  );

  const depositBtn = (full: boolean) => (
    <Button
      variant="primary-dark"
      size="default"
      onClick={onDeposit}
      className={full ? "flex-1" : undefined}
    >
      <ArrowDownToLine />
      {isConnected ? "Deposit" : "Connect to deposit"}
    </Button>
  );

  const withdrawBtn = (full: boolean) =>
    hasPosition ? (
      <Button
        variant="outline"
        size="default"
        onClick={onWithdraw}
        className={full ? "flex-1" : undefined}
      >
        <ArrowUpFromLine />
        Withdraw
      </Button>
    ) : null;

  return (
    <>
      {/* Desktop / tablet — inline in hero */}
      <div className="hidden sm:flex flex-wrap items-center gap-2">
        {followBtn(false)}
        {depositBtn(false)}
        {withdrawBtn(false)}
      </div>

      {/* Mobile — bottom-anchored sticky CTA */}
      <div className="sm:hidden fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur px-4 py-3 flex items-center gap-2">
        {followBtn(true)}
        {depositBtn(true)}
        {withdrawBtn(true)}
      </div>

      {depositMounted ? (
        <DepositModal
          open={depositOpen}
          onOpenChange={setDepositOpen}
          creator={creator}
        />
      ) : null}
      {withdrawMounted ? (
        <WithdrawModal
          open={withdrawOpen}
          onOpenChange={setWithdrawOpen}
          creator={creator}
        />
      ) : null}
    </>
  );
}
