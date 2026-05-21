"use client";

import { ConnectButton as RKConnectButton } from "@rainbow-me/rainbowkit";
import { ArrowDownToLine, ArrowUpFromLine, Star } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useFollowedCreators } from "@/lib/hooks/useFollowedCreators";
import { useUserShares } from "@/lib/hooks/useUserShares";
import { formatBps } from "@/lib/formatting/money";
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

            <DepositDialog
              open={depositOpen}
              onOpenChange={setDepositOpen}
              creator={creator}
            />
            <WithdrawDialog
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

function DepositDialog({
  open,
  onOpenChange,
  creator,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  creator: MockCreator;
}) {
  const [amount, setAmount] = useState("");
  const numeric = Number(amount);
  const isValid = !Number.isNaN(numeric) && numeric >= 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Deposit USDC into @{creator.handle}</DialogTitle>
          <DialogDescription>
            Two-step manual flow: approve USDC, then deposit. No relayer in v1.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-label">Amount (USDC)</label>
            <Input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100.00"
              inputMode="decimal"
              className="font-mono text-[15px]"
            />
            <div className="text-[11px] text-ink-3">
              Minimum deposit · <span className="num">$100.00</span>
            </div>
          </div>
          <ul className="text-[12px] text-ink-2 space-y-1 leading-relaxed border-t border-line pt-3">
            <li>
              • Price per share ·{" "}
              <span className="num text-ink">
                {creator.pricePerShare.toFixed(4)}
              </span>
            </li>
            <li>
              • Deposit fee ·{" "}
              <span className="num text-ink">
                {formatBps(creator.depositFeeBps)}
              </span>
            </li>
            <li>
              • Management fee ·{" "}
              <span className="num text-ink">
                {formatBps(creator.mgmtFeeBps)}
              </span>{" "}
              annualized
            </li>
          </ul>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary-dark" disabled={!isValid}>
            Continue to approve
          </Button>
        </DialogFooter>
        <p className="text-[11px] text-ink-3 text-center mt-1">
          On-chain wiring lands in a later step. UI flow is final.
        </p>
      </DialogContent>
    </Dialog>
  );
}

function WithdrawDialog({
  open,
  onOpenChange,
  creator,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  creator: MockCreator;
}) {
  const { data: position } = useUserShares(creator.id);
  const [shares, setShares] = useState("");
  const max = position?.share.shares ?? 0;
  const numeric = Number(shares);
  const isValid = !Number.isNaN(numeric) && numeric > 0 && numeric <= max;
  const proceeds = isValid ? numeric * (position?.pricePerShare ?? 1) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw from @{creator.handle}</DialogTitle>
          <DialogDescription>
            Burn shares for proportional USDC at live NAV.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1">
            <label className="text-label">Shares</label>
            <Input
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="0"
              inputMode="decimal"
              className="font-mono text-[15px]"
            />
            <div className="flex items-center justify-between text-[11px] text-ink-3">
              <span>
                Available ·{" "}
                <span className="num">{Math.round(max).toLocaleString()}</span>
              </span>
              <button
                type="button"
                className="text-brand hover:underline"
                onClick={() => setShares(String(max))}
              >
                Max
              </button>
            </div>
          </div>
          <div className="border-t border-line pt-3 flex items-baseline justify-between">
            <span className="text-[12px] text-ink-2">You receive</span>
            <span className="num text-heading-md text-ink">
              ${Math.round(proceeds).toLocaleString()}
            </span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary-dark" disabled={!isValid}>
            Continue to withdraw
          </Button>
        </DialogFooter>
        <p className="text-[11px] text-ink-3 text-center mt-1">
          On-chain wiring lands in a later step. UI flow is final.
        </p>
      </DialogContent>
    </Dialog>
  );
}
