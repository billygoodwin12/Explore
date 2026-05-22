"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAccount } from "wagmi";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { getChainById, hyperliquidTestnet } from "@/lib/chain/hyperliquid";
import { expectedChainId } from "@/lib/chain/switchChain";
import { shortenHash } from "@/lib/formatting/address";
import { formatBps } from "@/lib/formatting/money";
import { useCurrentUserVault } from "@/lib/hooks/useCurrentUserVault";
import { useUserShares } from "@/lib/hooks/useUserShares";
import { getMockStore } from "@/lib/mock/store";
import type { Hex, MockCreator } from "@/lib/mock/types";
import { cn } from "@/lib/utils";

const FLOOR_BPS = 500;
const WITHDRAW_MS = 1800;
const QUICK_PERCENTS = [25, 50, 75, 100] as const;
const PERF_TREASURY_SHARE = 0.1;

type Phase = "amount" | "confirm" | "inflight" | "success" | "error";
type TxStatus = "idle" | "pending" | "done";

/** Resolves after `ms`. A real on-chain call can reject; this is the seam. */
function mockTx(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type WithdrawModalProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  creator: MockCreator;
};

function mockTxHash(): Hex {
  const chars = "0123456789abcdef";
  let out = "0x";
  for (let i = 0; i < 64; i++) out += chars[Math.floor(Math.random() * 16)];
  return out as Hex;
}

function explorerBase(): string {
  return (getChainById(expectedChainId()) ?? hyperliquidTestnet).blockExplorers
    .default.url;
}

export function WithdrawModal({ open, onOpenChange, creator }: WithdrawModalProps) {
  const { address } = useAccount();
  const { data: position } = useUserShares(creator.id);
  const { data: ownVault } = useCurrentUserVault();

  const isCreatorSelf = ownVault?.id === creator.id;
  const maxShares = position?.share.shares ?? 0;
  const costPerShare =
    position && position.share.shares > 0
      ? position.share.costBasis / position.share.shares
      : 0;

  const [phase, setPhase] = useState<Phase>("amount");
  const [shares, setShares] = useState("");
  const [acknowledgedGuard, setAcknowledgedGuard] = useState(false);
  const [withdrawStatus, setWithdrawStatus] = useState<TxStatus>("idle");
  const [withdrawTxHash, setWithdrawTxHash] = useState<Hex | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!open) {
      setPhase("amount");
      setShares("");
      setAcknowledgedGuard(false);
      setWithdrawStatus("idle");
      setWithdrawTxHash(null);
      setErrorMessage("");
    }
  }, [open]);

  const sharesNum = Number(shares);
  const sharesValid =
    !Number.isNaN(sharesNum) && sharesNum > 0 && sharesNum <= maxShares;
  const gross = sharesValid ? sharesNum * creator.pricePerShare : 0;
  const costPortion = sharesValid ? sharesNum * costPerShare : 0;
  const gain = Math.max(0, gross - costPortion);

  const entryRate = position?.share.entryPerfFeeBps ?? creator.perfFeeBps;
  const currentRate = creator.perfFeeBps;
  const appliedRateBps = Math.min(entryRate, currentRate);
  const perfFeeUsdc = (gain * appliedRateBps) / 10_000;
  const creatorPerfShare = perfFeeUsdc * (1 - PERF_TREASURY_SHARE);
  const protocolPerfShare = perfFeeUsdc * PERF_TREASURY_SHARE;
  const net = gross - perfFeeUsdc;

  const newNav = Math.max(0, creator.nav - gross);
  const newCreatorStakeUsdc = isCreatorSelf
    ? Math.max(0, creator.creatorStakeUsdc - gross)
    : creator.creatorStakeUsdc;
  const newStakeBps =
    newNav > 0 ? Math.round((newCreatorStakeUsdc / newNav) * 10_000) : 0;
  const wouldBreachFloor = isCreatorSelf && newStakeBps < FLOOR_BPS;

  const canContinue = sharesValid;
  const canConfirm = sharesValid && (!wouldBreachFloor || acknowledgedGuard);

  function setSharesFromPercent(pct: number) {
    if (maxShares <= 0) return;
    const value = (maxShares * pct) / 100;
    setShares(value.toFixed(value < 1 ? 4 : 2));
  }

  function startTransactions() {
    setErrorMessage("");
    setPhase("inflight");
    void runWithdraw();
  }

  async function runWithdraw() {
    setWithdrawStatus("pending");
    const id = toast.loading(`Withdrawing from @${creator.handle}…`);
    try {
      await mockTx(WITHDRAW_MS);
      getMockStore().removeUserShares(creator.id, sharesNum);
      setWithdrawTxHash(mockTxHash());
      setWithdrawStatus("done");
      toast.success(`Received $${net.toFixed(2)} USDC`, { id });
      setPhase("success");
    } catch {
      setWithdrawStatus("idle");
      toast.error("Withdrawal failed", { id });
      setErrorMessage(
        "The withdrawal transaction didn't go through. Your shares are untouched — nothing was burned.",
      );
      setPhase("error");
    }
  }

  function retry() {
    setWithdrawStatus("idle");
    setWithdrawTxHash(null);
    setErrorMessage("");
    setPhase("confirm");
  }

  function tryClose(v: boolean) {
    if (phase === "inflight") return;
    onOpenChange(v);
  }

  if (!position) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>No position to withdraw</DialogTitle>
            <DialogDescription>
              You don't hold any shares in @{creator.handle}.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end mt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={tryClose}>
      <DialogContent
        className="max-w-md sm:max-w-lg"
        showCloseButton={phase !== "inflight"}
        onPointerDownOutside={(e) => {
          if (phase === "inflight") e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (phase === "inflight") e.preventDefault();
        }}
      >
        {phase === "amount" ? (
          <AmountStep
            creator={creator}
            shares={shares}
            setShares={setShares}
            setSharesFromPercent={setSharesFromPercent}
            maxShares={maxShares}
            sharesValid={sharesValid}
            gross={gross}
            gain={gain}
            perfFeeUsdc={perfFeeUsdc}
            creatorPerfShare={creatorPerfShare}
            protocolPerfShare={protocolPerfShare}
            appliedRateBps={appliedRateBps}
            entryRate={entryRate}
            currentRate={currentRate}
            net={net}
            canContinue={canContinue}
            onContinue={() => setPhase("confirm")}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}

        {phase === "confirm" ? (
          <ConfirmStep
            creator={creator}
            shares={sharesNum}
            gross={gross}
            perfFeeUsdc={perfFeeUsdc}
            net={net}
            wouldBreachFloor={wouldBreachFloor}
            newStakeBps={newStakeBps}
            acknowledgedGuard={acknowledgedGuard}
            setAcknowledgedGuard={setAcknowledgedGuard}
            canConfirm={canConfirm}
            onBack={() => setPhase("amount")}
            onConfirm={startTransactions}
          />
        ) : null}

        {phase === "inflight" ? (
          <InflightStep
            creator={creator}
            withdrawStatus={withdrawStatus}
            withdrawTxHash={withdrawTxHash}
          />
        ) : null}

        {phase === "success" ? (
          <SuccessStep
            creator={creator}
            shares={sharesNum}
            net={net}
            withdrawTxHash={withdrawTxHash}
            onClose={() => onOpenChange(false)}
          />
        ) : null}

        {phase === "error" ? (
          <ErrorStep
            message={errorMessage}
            onRetry={retry}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ErrorStep({
  message,
  onRetry,
  onClose,
}: {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="text-center space-y-4 pt-2">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-negative/10">
          <AlertTriangle className="size-6 text-negative" strokeWidth={1.75} />
        </div>
        <div className="space-y-1">
          <DialogTitle className="text-heading-lg">
            Transaction failed
          </DialogTitle>
          <p className="text-[13px] text-ink-2 leading-relaxed max-w-sm mx-auto">
            {message}
          </p>
        </div>
      </div>
      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button variant="primary-dark" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </>
  );
}

function AmountStep(props: {
  creator: MockCreator;
  shares: string;
  setShares: (v: string) => void;
  setSharesFromPercent: (p: number) => void;
  maxShares: number;
  sharesValid: boolean;
  gross: number;
  gain: number;
  perfFeeUsdc: number;
  creatorPerfShare: number;
  protocolPerfShare: number;
  appliedRateBps: number;
  entryRate: number;
  currentRate: number;
  net: number;
  canContinue: boolean;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const {
    creator,
    shares,
    setShares,
    setSharesFromPercent,
    maxShares,
    sharesValid,
    gross,
    gain,
    perfFeeUsdc,
    creatorPerfShare,
    protocolPerfShare,
    appliedRateBps,
    entryRate,
    currentRate,
    net,
    canContinue,
    onContinue,
    onCancel,
  } = props;

  const hasGain = gain > 0;
  const rateLocked = appliedRateBps < currentRate;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Withdraw from @{creator.handle}</DialogTitle>
        <DialogDescription>
          Burn shares for USDC at the live NAV. One transaction.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-label" htmlFor="withdraw-shares">
              Shares to burn
            </label>
            <span className="text-[11px] text-ink-3 num">
              Available · {Math.round(maxShares).toLocaleString()}
            </span>
          </div>
          <Input
            id="withdraw-shares"
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="0"
            inputMode="decimal"
            className="font-mono text-[22px] h-14 text-center"
            autoFocus
          />
          <div className="grid grid-cols-4 gap-2">
            {QUICK_PERCENTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setSharesFromPercent(p)}
                className="h-8 rounded-full border border-line bg-surface hover:bg-surface-2 text-[12px] font-medium text-ink transition-colors num"
              >
                {p}%
              </button>
            ))}
          </div>
        </div>

        <article className="rounded-md border border-line bg-surface-2/60 p-3 space-y-1.5">
          <div className="text-label">You'll receive (gross)</div>
          <div className="flex items-baseline justify-between">
            <span className="num text-heading-md text-ink">
              ${sharesValid ? gross.toFixed(2) : "—"}
            </span>
            <span className="text-[11px] text-ink-3 num">
              @ ${creator.pricePerShare.toFixed(4)} / share
            </span>
          </div>
        </article>

        {hasGain ? (
          <article className="rounded-md border border-line bg-surface p-3 space-y-2">
            <div className="flex items-baseline justify-between">
              <div className="text-label">
                Performance fee carve-out
              </div>
              <span className="num text-[13px] text-ink-2">
                −${perfFeeUsdc.toFixed(2)}
              </span>
            </div>
            <div className="text-[11px] text-ink-3 leading-relaxed">
              <span className="num text-ink">${gain.toFixed(2)}</span> gain ×{" "}
              <span className="num text-ink">{formatBps(appliedRateBps)}</span>{" "}
              applied rate
              {rateLocked ? (
                <span className="ml-1 text-positive">
                  (locked to your entry rate of{" "}
                  {formatBps(entryRate)})
                </span>
              ) : null}
            </div>
            <div className="border-t border-line pt-2 space-y-1 text-[11px]">
              <div className="flex items-baseline justify-between">
                <span className="text-ink-2">
                  Creator · <span className="num">90%</span>
                </span>
                <span className="num text-ink-2">
                  ${creatorPerfShare.toFixed(2)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-ink-2">
                  Theorise · <span className="num">10%</span>
                </span>
                <span className="num text-ink-2">
                  ${protocolPerfShare.toFixed(2)}
                </span>
              </div>
            </div>
          </article>
        ) : null}

        <article className="rounded-md border border-line bg-surface p-3 flex items-baseline justify-between">
          <span className="text-[13px] font-medium text-ink">Net to wallet</span>
          <span className="num text-heading-md text-ink">
            ${sharesValid ? net.toFixed(2) : "—"}
          </span>
        </article>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary-dark"
          onClick={onContinue}
          disabled={!canContinue}
        >
          Continue
        </Button>
      </div>
    </>
  );
}

function ConfirmStep(props: {
  creator: MockCreator;
  shares: number;
  gross: number;
  perfFeeUsdc: number;
  net: number;
  wouldBreachFloor: boolean;
  newStakeBps: number;
  acknowledgedGuard: boolean;
  setAcknowledgedGuard: (v: boolean) => void;
  canConfirm: boolean;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const {
    creator,
    shares,
    gross,
    perfFeeUsdc,
    net,
    wouldBreachFloor,
    newStakeBps,
    acknowledgedGuard,
    setAcknowledgedGuard,
    canConfirm,
    onBack,
    onConfirm,
  } = props;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Confirm withdrawal</DialogTitle>
        <DialogDescription>
          One on-chain transaction. Sign in your wallet to proceed.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <article className="rounded-md border border-line bg-surface-2/60 p-3 space-y-2 text-[13px]">
          <Line
            label="Shares burned"
            value={shares.toFixed(shares < 1 ? 4 : 2)}
          />
          <Line label="Gross" value={`$${gross.toFixed(2)}`} muted />
          {perfFeeUsdc > 0 ? (
            <Line
              label="Performance fee"
              value={`−$${perfFeeUsdc.toFixed(2)}`}
              muted
            />
          ) : null}
          <div className="border-t border-line pt-2">
            <Line label="Net to wallet" value={`$${net.toFixed(2)}`} emphasis />
          </div>
        </article>

        {wouldBreachFloor ? (
          <article className="border-l-2 border-negative bg-negative/5 pl-3 pr-3 py-3 space-y-2">
            <div className="text-[12px] font-medium text-ink flex items-center gap-1.5">
              <AlertTriangle
                className="size-3.5 text-negative"
                strokeWidth={2}
              />
              You'd breach your own 5% stake floor
            </div>
            <p className="text-[11px] text-ink-2 leading-relaxed">
              This withdrawal would drop your creator stake to{" "}
              <span className="num text-ink">{formatBps(newStakeBps)}</span> of
              vault NAV. You'd enter a 48-hour cure window immediately. If you
              don't top up before it expires,{" "}
              <span className="font-medium text-ink">
                @{creator.handle} auto-dissolves
              </span>{" "}
              and depositors get refunded pro-rata.
            </p>
            <label className="flex items-start gap-2 text-[12px] text-ink cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={acknowledgedGuard}
                onChange={(e) => setAcknowledgedGuard(e.target.checked)}
                className="mt-0.5 size-3.5 rounded border-line text-negative focus-visible:ring-2 focus-visible:ring-negative/40"
              />
              <span>
                I understand my stake will fall below 5% and I accept the cure
                window risk.
              </span>
            </label>
          </article>
        ) : null}
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          variant={wouldBreachFloor ? "destructive" : "primary-dark"}
          onClick={onConfirm}
          disabled={!canConfirm}
        >
          {wouldBreachFloor ? "Withdraw anyway" : "Confirm & sign"}
        </Button>
      </div>
    </>
  );
}

function InflightStep(props: {
  creator: MockCreator;
  withdrawStatus: TxStatus;
  withdrawTxHash: Hex | null;
}) {
  const { creator, withdrawStatus, withdrawTxHash } = props;
  const explorer = explorerBase();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Processing withdrawal</DialogTitle>
        <DialogDescription>
          Sign in your wallet. Don't close this window.
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-start gap-3 rounded-md border border-line bg-surface p-3">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-[11px] font-medium shrink-0",
            withdrawStatus === "done" && "bg-positive text-bg",
            withdrawStatus === "pending" && "bg-ink text-bg",
            withdrawStatus === "idle" && "bg-surface-2 text-ink-3 border border-line",
          )}
        >
          {withdrawStatus === "done" ? (
            <CheckCircle2 className="size-3.5" strokeWidth={2.5} />
          ) : withdrawStatus === "pending" ? (
            <Loader2 className="size-3.5 animate-spin" strokeWidth={2.5} />
          ) : (
            1
          )}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-ink">Withdraw</div>
          <div className="text-[12px] text-ink-2 leading-tight">
            Burn shares of @{creator.handle} for USDC.
          </div>
          {withdrawTxHash ? (
            <Link
              href={`${explorer}/tx/${withdrawTxHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="num text-[11px] text-ink-3 hover:text-brand inline-flex items-center gap-1 mt-0.5"
            >
              {shortenHash(withdrawTxHash, 4)}
              <ExternalLink className="size-2.5" />
            </Link>
          ) : null}
        </div>
        <span
          className={cn(
            "text-[11px] num shrink-0",
            withdrawStatus === "done" && "text-positive",
            withdrawStatus === "pending" && "text-ink-2",
            withdrawStatus === "idle" && "text-ink-3",
          )}
        >
          {withdrawStatus === "done" && "confirmed"}
          {withdrawStatus === "pending" && "pending…"}
          {withdrawStatus === "idle" && "waiting"}
        </span>
      </div>
    </>
  );
}

function SuccessStep(props: {
  creator: MockCreator;
  shares: number;
  net: number;
  withdrawTxHash: Hex | null;
  onClose: () => void;
}) {
  const { creator, shares, net, withdrawTxHash, onClose } = props;
  const explorer = explorerBase();
  return (
    <>
      <div className="text-center space-y-4 pt-2">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-positive/10">
          <CheckCircle2 className="size-6 text-positive" strokeWidth={1.75} />
        </div>
        <div className="space-y-1">
          <DialogTitle className="text-heading-lg">
            Withdrawal confirmed
          </DialogTitle>
          <p className="text-[13px] text-ink-2">
            USDC has been sent to your wallet.
          </p>
        </div>
      </div>

      <article className="rounded-md border border-line bg-surface-2/60 p-3 space-y-2 text-[13px]">
        <Line
          label="Shares burned"
          value={shares.toFixed(shares < 1 ? 4 : 2)}
        />
        <Line label="USDC received" value={`$${net.toFixed(2)}`} emphasis />
      </article>

      {withdrawTxHash ? (
        <Link
          href={`${explorer}/tx/${withdrawTxHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 text-[12px] text-ink-2 hover:text-brand num"
        >
          {shortenHash(withdrawTxHash, 6)}
          <ExternalLink className="size-3" />
        </Link>
      ) : null}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
        <Button asChild variant="primary-dark">
          <Link href="/portfolio" onClick={onClose}>
            View portfolio
          </Link>
        </Button>
      </div>
      <p className="text-[11px] text-ink-3 text-center">
        @{creator.handle} · {Math.round(net).toLocaleString()} USDC withdrawn
      </p>
    </>
  );
}

function Line({
  label,
  value,
  muted,
  emphasis,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={cn("text-ink-2", muted && "text-ink-3")}>{label}</span>
      <span
        className={cn(
          "num",
          muted ? "text-ink-3" : "text-ink",
          emphasis && "text-heading-md font-medium",
        )}
      >
        {value}
      </span>
    </div>
  );
}
