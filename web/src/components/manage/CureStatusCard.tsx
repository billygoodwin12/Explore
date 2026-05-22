"use client";

import { AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import { formatBps } from "@/lib/formatting/money";
import { formatCountdown } from "@/lib/formatting/time";
import type { MockCreator } from "@/lib/mock/types";

const FLOOR_BPS = 500;
const CURE_WINDOW_MS = 48 * 60 * 60 * 1000;

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function CureStatusCard({ creator }: { creator: MockCreator }) {
  const now = useNow(1000);
  const inCure = creator.cureWindowStartedAt !== null;
  const cureEndsAt = creator.cureWindowStartedAt
    ? creator.cureWindowStartedAt + CURE_WINDOW_MS
    : null;
  const expired = cureEndsAt !== null && now >= cureEndsAt;

  const requiredUsdc = (creator.nav * FLOOR_BPS) / 10_000;
  const shortfall = Math.max(0, requiredUsdc - creator.creatorStakeUsdc);

  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(shortfall.toFixed(2));
  const numeric = Number(amount);
  const isValid = !Number.isNaN(numeric) && numeric > 0;

  if (!inCure) return null;

  async function onTopUp() {
    const id = toast.loading("Topping up stake…");
    await new Promise((r) => setTimeout(r, 1800));
    toast.success(`+$${numeric.toFixed(2)} added to stake`, {
      id,
      description: "Cure window cleared once the tx confirms.",
    });
    setOpen(false);
  }

  return (
    <section className="rounded-lg border border-negative/30 bg-negative/5 p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-negative" strokeWidth={2} />
          <div className="text-label !text-negative">Cure window active</div>
        </div>
        <div className="num text-heading-md text-ink">
          {cureEndsAt && !expired ? formatCountdown(cureEndsAt, now) : "expired"}
        </div>
      </div>

      <p className="text-[13px] text-ink-2 leading-relaxed">
        Your stake is at{" "}
        <span className="num text-ink">{formatBps(creator.creatorStakeBps)}</span>{" "}
        — below the{" "}
        <span className="num text-ink">{formatBps(FLOOR_BPS)}</span> floor. Top
        up at least{" "}
        <span className="num text-ink">${shortfall.toFixed(2)}</span> before
        the timer ends to keep your vault live. If you miss it, the vault
        auto-dissolves and depositors are refunded pro-rata.
      </p>

      <div className="flex gap-2">
        <Button
          variant="primary-dark"
          size="default"
          onClick={() => {
            setAmount(shortfall.toFixed(2));
            setOpen(true);
          }}
        >
          Top up stake
        </Button>
        <Button asChild variant="ghost" size="default">
          <a
            href="https://www.theorise.app/docs/cure-window"
            target="_blank"
            rel="noopener noreferrer"
          >
            Learn more →
          </a>
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Top up creator stake</DialogTitle>
            <DialogDescription>
              Deposits USDC directly to your stake account. Clears the cure
              window once your stake is back at or above 5% of NAV.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-label" htmlFor="topup-amount">
              Amount (USDC)
            </label>
            <Input
              id="topup-amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="num text-[15px] h-11"
              inputMode="decimal"
            />
            <div className="text-[11px] text-ink-3">
              Minimum to clear · <span className="num">${shortfall.toFixed(2)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary-dark"
              onClick={onTopUp}
              disabled={!isValid}
            >
              Confirm top-up
            </Button>
          </DialogFooter>
          <p className="text-[11px] text-ink-3 text-center mt-1">
            On-chain wiring lands in a later step.
          </p>
        </DialogContent>
      </Dialog>
    </section>
  );
}
