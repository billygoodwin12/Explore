"use client";

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowDownToLine, ArrowUpFromLine, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { DepositModal } from "@/components/transactions/DepositModal";
import { WithdrawModal } from "@/components/transactions/WithdrawModal";
import { Button } from "@/components/ui/button";
import { useFollowedCreators } from "@/lib/hooks/useFollowedCreators";
import { useUserShares } from "@/lib/hooks/useUserShares";
import type { MockCreator } from "@/lib/mock/types";
import { cn } from "@/lib/utils";

export function CreatorActions({ creator }: { creator: MockCreator }) {
  const { isConnected } = useAccount();
  const { data: followed = [], follow, unfollow } = useFollowedCreators();
  const { data: position } = useUserShares(creator.id);
  const isFollowing = followed.some((c) => c.id === creator.id);

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

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

  return (
    <RKConnectButton.Custom>
      {({ openConnectModal, mounted, account }) => {
        const ready = mounted;
        const connected = ready && Boolean(account);

        return (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={isFollowing ? "secondary" : "ghost"}
              size="default"
              onClick={onToggleFollow}
            >
              <Star
                className={cn(
                  "size-4",
                  isFollowing && "fill-brand text-brand",
                )}
                strokeWidth={1.75}
              />
              {isFollowing ? "Following" : "Follow"}
            </Button>

            {connected ? (
              <Button
                variant="primary-dark"
                size="default"
                onClick={() => setDepositOpen(true)}
              >
                <ArrowDownToLine />
                Deposit
              </Button>
            ) : (
              <Button
                variant="primary-dark"
                size="default"
                onClick={openConnectModal}
                disabled={!ready}
              >
                Connect to deposit
              </Button>
            )}

            {position ? (
              <Button
                variant="outline"
                size="default"
                onClick={() => setWithdrawOpen(true)}
              >
                <ArrowUpFromLine />
                Withdraw
              </Button>
            ) : null}

            <DepositModal
              open={depositOpen}
              onOpenChange={setDepositOpen}
              creator={creator}
            />
            <WithdrawModal
              open={withdrawOpen}
              onOpenChange={setWithdrawOpen}
              creator={creator}
            />
          </div>
        );
      }}
    </RKConnectButton.Custom>
  );
}
