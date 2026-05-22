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
import { useUserShares } from "@/lib/hooks/useUserShares";
import { getMockStore } from "@/lib/mock/store";
import type { Hex, MockCreator } from "@/lib/mock/types";
import {
  hasRecentDeposit,
  recordDeposit,
} from "@/lib/store/recentDeposits";
import { cn } from "@/lib/utils";

const QUICK_AMOUNTS = [25, 100, 500] as const;
const MIN_DEPOSIT_USDC = 1;
const DEPOSIT_TREASURY_SHARE = 0.2;
const APPROVE_MS = 1600;
const DEPOSIT_MS = 2200;
const FRICTION_SECONDS = 5;

type Phase = "amount" | "confirm" | "inflight" | "success" | "error";
type TxStatus = "idle" | "pending" | "done";

type DepositModalProps = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  creator: MockCreator;
};

/** Resolves after `ms`. A real on-chain call can reject; this is the seam. */
function mockTx(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

export function DepositModal({ open, onOpenChange, creator }: DepositModalProps) {
  const { address } = useAccount();
  const { data: position } = useUserShares(creator.id);

  const usdcBalance = useMemo(
    () => getMockStore().getUserUsdcBalance(address as Hex | undefined),
    [address],
  );

  const [phase, setPhase] = useState<Phase>("amount");
  const [amount, setAmount] = useState("");
  const [approveStatus, setApproveStatus] = useState<TxStatus>("idle");
  const [depositStatus, setDepositStatus] = useState<TxStatus>("idle");
  const [approveTxHash, setApproveTxHash] = useState<Hex | null>(null);
  const [depositTxHash, setDepositTxHash] = useState<Hex | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");

  const recentDepositor = useMemo(
    () => (open ? hasRecentDeposit(creator.id) : false),
    [open, creator.id],
  );

  useEffect(() => {
    if (!open) {
      setPhase("amount");
      setAmount("");
      setApproveStatus("idle");
      setDepositStatus("idle");
      setApproveTxHash(null);
      setDepositTxHash(null);
      setCountdown(null);
      setErrorMessage("");
      return;
    }
    if (recentDepositor) setCountdown(FRICTION_SECONDS);
  }, [open, recentDepositor]);

  useEffect(() => {
    if (countdown === null || countdown <= 0) return;
    const t = setTimeout(() => {
      setCountdown((c) => (c === null ? null : Math.max(0, c - 1)));
    }, 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const numeric = Number(amount);
  const amountValid =
    !Number.isNaN(numeric) &&
    numeric >= MIN_DEPOSIT_USDC &&
    numeric <= usdcBalance;
  const depositFeeUsdc = amountValid
    ? (numeric * creator.depositFeeBps) / 10_000
    : 0;
  const netDeposit = amountValid ? numeric - depositFeeUsdc : 0;
  const creatorFeeShare = depositFeeUsdc * (1 - DEPOSIT_TREASURY_SHARE);
  const protocolFeeShare = depositFeeUsdc * DEPOSIT_TREASURY_SHARE;
  const sharesReceived = amountValid ? netDeposit / creator.pricePerShare : 0;
  const currentHolding = position?.currentValue ?? 0;
  const newHolding = currentHolding + numeric;

  const countdownActive = countdown !== null && countdown > 0;
  const canContinue = amountValid && !countdownActive;

  function startTransactions() {
    setErrorMessage("");
    setPhase("inflight");
    void runApprove();
  }

  function fail(message: string) {
    setErrorMessage(message);
    setPhase("error");
  }

  async function runApprove() {
    setApproveStatus("pending");
    const id = toast.loading("Approving USDC spend…");
    try {
      await mockTx(APPROVE_MS);
      setApproveTxHash(mockTxHash());
      setApproveStatus("done");
      toast.success("USDC approved", { id });
      await runDeposit();
    } catch {
      setApproveStatus("idle");
      toast.error("Approval failed", { id });
      fail("The USDC approval transaction didn't go through. No funds moved.");
    }
  }

  async function runDeposit() {
    setDepositStatus("pending");
    const id = toast.loading(`Depositing into @${creator.handle}…`);
    try {
      await mockTx(DEPOSIT_MS);
      getMockStore().addUserShares(
        creator.id,
        sharesReceived,
        numeric,
        address as Hex | undefined,
      );
      recordDeposit(creator.id);
      setDepositTxHash(mockTxHash());
      setDepositStatus("done");
      toast.success(
        `Deposited $${numeric.toFixed(2)} into @${creator.handle}`,
        { id },
      );
      setPhase("success");
    } catch {
      setDepositStatus("idle");
      toast.error("Deposit failed", { id });
      fail(
        "USDC was approved, but the deposit transaction didn't go through. Your approval still stands — retry the deposit.",
      );
    }
  }

  function retry() {
    setApproveStatus("idle");
    setDepositStatus("idle");
    setApproveTxHash(null);
    setDepositTxHash(null);
    setErrorMessage("");
    setPhase("confirm");
  }

  function tryClose(v: boolean) {
    if (phase === "inflight") return;
    onOpenChange(v);
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
            amount={amount}
            setAmount={setAmount}
            usdcBalance={usdcBalance}
            amountValid={amountValid}
            depositFeeUsdc={depositFeeUsdc}
            netDeposit={netDeposit}
            sharesReceived={sharesReceived}
            creatorFeeShare={creatorFeeShare}
            protocolFeeShare={protocolFeeShare}
            countdown={countdown}
            countdownActive={countdownActive}
            recentDepositor={recentDepositor}
            currentHolding={currentHolding}
            newHolding={newHolding}
            canContinue={canContinue}
            onContinue={() => setPhase("confirm")}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}

        {phase === "confirm" ? (
          <ConfirmStep
            creator={creator}
            amount={numeric}
            depositFeeUsdc={depositFeeUsdc}
            netDeposit={netDeposit}
            sharesReceived={sharesReceived}
            onBack={() => setPhase("amount")}
            onConfirm={startTransactions}
          />
        ) : null}

        {phase === "inflight" ? (
          <InflightStep
            creator={creator}
            approveStatus={approveStatus}
            depositStatus={depositStatus}
            approveTxHash={approveTxHash}
            depositTxHash={depositTxHash}
          />
        ) : null}

        {phase === "success" ? (
          <SuccessStep
            creator={creator}
            amount={numeric}
            sharesReceived={sharesReceived}
            newHolding={newHolding}
            depositTxHash={depositTxHash}
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
  amount: string;
  setAmount: (v: string) => void;
  usdcBalance: number;
  amountValid: boolean;
  depositFeeUsdc: number;
  netDeposit: number;
  sharesReceived: number;
  creatorFeeShare: number;
  protocolFeeShare: number;
  countdown: number | null;
  countdownActive: boolean;
  recentDepositor: boolean;
  currentHolding: number;
  newHolding: number;
  canContinue: boolean;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const {
    creator,
    amount,
    setAmount,
    usdcBalance,
    amountValid,
    depositFeeUsdc,
    netDeposit,
    sharesReceived,
    creatorFeeShare,
    protocolFeeShare,
    countdown,
    countdownActive,
    recentDepositor,
    currentHolding,
    newHolding,
    canContinue,
    onContinue,
    onCancel,
  } = props;

  return (
    <>
      <DialogHeader>
        <DialogTitle>Deposit into @{creator.handle}</DialogTitle>
        <DialogDescription>
          Buy share tokens at the live NAV. Two on-chain transactions.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-label" htmlFor="deposit-amount">
              Amount (USDC)
            </label>
            <span className="text-[11px] text-ink-3 num">
              Available · ${usdcBalance.toFixed(2)}
            </span>
          </div>
          <Input
            id="deposit-amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            inputMode="decimal"
            className="num text-[22px] h-14 text-center"
            autoFocus
          />
          <div className="grid grid-cols-4 gap-2">
            {QUICK_AMOUNTS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setAmount(String(v))}
                className="h-8 rounded-full border border-line bg-surface hover:bg-surface-2 text-[12px] font-medium text-ink transition-colors num"
              >
                ${v}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAmount(usdcBalance.toFixed(2))}
              className="h-8 rounded-full border border-line bg-surface hover:bg-surface-2 text-[12px] font-medium text-ink transition-colors"
            >
              Max
            </button>
          </div>
        </div>

        <article className="rounded-md border border-line bg-surface-2/60 p-3 space-y-1.5">
          <div className="text-label">You'll receive</div>
          <div className="flex items-baseline justify-between">
            <span className="num text-heading-md text-ink">
              {amountValid ? sharesReceived.toFixed(2) : "—"}
            </span>
            <span className="text-[11px] text-ink-3">shares</span>
          </div>
          <p className="text-[11px] text-ink-3 num">
            @ ${creator.pricePerShare.toFixed(4)} / share (live NAV)
          </p>
        </article>

        <article className="rounded-md border border-line bg-surface p-3 space-y-2">
          <div className="flex items-baseline justify-between">
            <div className="text-label">
              Deposit fee · {formatBps(creator.depositFeeBps)}
            </div>
            <span className="num text-[13px] text-ink-2">
              ${depositFeeUsdc.toFixed(2)}
            </span>
          </div>
          <div className="border-t border-line pt-2 space-y-1 text-[11px]">
            <div className="flex items-baseline justify-between">
              <span className="text-ink-2">
                Creator · <span className="num">80%</span>
              </span>
              <span className="num text-ink-2">
                ${creatorFeeShare.toFixed(2)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-ink-2">
                Theorise · <span className="num">20%</span>
              </span>
              <span className="num text-ink-2">
                ${protocolFeeShare.toFixed(2)}
              </span>
            </div>
          </div>
        </article>

        <article className="border-l-2 border-warning bg-warning/5 pl-3 py-2 space-y-1">
          <div className="text-[12px] font-medium text-ink flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 text-warning" strokeWidth={2} />
            Risk disclosure
          </div>
          <p className="text-[11px] text-ink-2 leading-relaxed">
            You're trusting @{creator.handle}'s trading. If they take losing
            trades, you lose money pro-rata. Theorise does not guarantee any
            return.
          </p>
        </article>

        {recentDepositor ? (
          <article className="rounded-md border border-line bg-surface p-3 text-[12px] text-ink-2 leading-relaxed">
            <span className="num text-ink">
              You currently hold ${currentHolding.toFixed(2)}
            </span>{" "}
            in this vault.{" "}
            {amountValid ? (
              <>
                This brings it to{" "}
                <span className="num text-ink">${newHolding.toFixed(2)}</span>.
              </>
            ) : (
              <>Enter an amount to preview your new position.</>
            )}
          </article>
        ) : null}
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
          {countdownActive ? (
            <>
              <Loader2 className="animate-spin" />
              Continue in {countdown}s
            </>
          ) : (
            "Continue"
          )}
        </Button>
      </div>
    </>
  );
}

function ConfirmStep(props: {
  creator: MockCreator;
  amount: number;
  depositFeeUsdc: number;
  netDeposit: number;
  sharesReceived: number;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const {
    creator,
    amount,
    depositFeeUsdc,
    netDeposit,
    sharesReceived,
    onBack,
    onConfirm,
  } = props;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Confirm deposit</DialogTitle>
        <DialogDescription>
          Review the details. The next click triggers two wallet prompts.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <article className="rounded-md border border-line bg-surface-2/60 p-3 space-y-2 text-[13px]">
          <Line label="You pay" value={`$${amount.toFixed(2)}`} />
          <Line
            label={`Deposit fee (${formatBps(creator.depositFeeBps)})`}
            value={`−$${depositFeeUsdc.toFixed(2)}`}
            muted
          />
          <Line label="Net deposit" value={`$${netDeposit.toFixed(2)}`} muted />
          <div className="border-t border-line pt-2">
            <Line
              label="Shares received"
              value={sharesReceived.toFixed(2)}
              emphasis
            />
            <Line
              label="Price / share"
              value={`$${creator.pricePerShare.toFixed(4)}`}
              muted
            />
          </div>
        </article>

        <article className="rounded-md border border-line bg-surface p-3 space-y-1.5 text-[12px] text-ink-2">
          <div className="text-label">Two-transaction flow</div>
          <ol className="space-y-1 list-decimal list-inside leading-relaxed">
            <li>
              <span className="num text-ink">Approve</span> the vault contract
              to pull{" "}
              <span className="num text-ink">${amount.toFixed(2)}</span> USDC.
            </li>
            <li>
              <span className="num text-ink">Deposit</span> into the vault and
              receive shares.
            </li>
          </ol>
        </article>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button variant="primary-dark" onClick={onConfirm}>
          Confirm &amp; sign
        </Button>
      </div>
    </>
  );
}

function InflightStep(props: {
  creator: MockCreator;
  approveStatus: TxStatus;
  depositStatus: TxStatus;
  approveTxHash: Hex | null;
  depositTxHash: Hex | null;
}) {
  const { creator, approveStatus, depositStatus, approveTxHash, depositTxHash } =
    props;
  const explorer = explorerBase();
  return (
    <>
      <DialogHeader>
        <DialogTitle>Processing deposit</DialogTitle>
        <DialogDescription>
          Sign each prompt in your wallet. Don't close this window.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <TxRow
          index={1}
          label="Approve USDC"
          description="Authorize the vault contract."
          status={approveStatus}
          hash={approveTxHash}
          explorer={explorer}
        />
        <TxRow
          index={2}
          label="Deposit"
          description={`Buy shares of @${creator.handle}.`}
          status={depositStatus}
          hash={depositTxHash}
          explorer={explorer}
        />
      </div>
    </>
  );
}

function SuccessStep(props: {
  creator: MockCreator;
  amount: number;
  sharesReceived: number;
  newHolding: number;
  depositTxHash: Hex | null;
  onClose: () => void;
}) {
  const { creator, amount, sharesReceived, newHolding, depositTxHash, onClose } =
    props;
  const explorer = explorerBase();
  return (
    <>
      <div className="text-center space-y-4 pt-2">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-positive/10">
          <CheckCircle2 className="size-6 text-positive" strokeWidth={1.75} />
        </div>
        <div className="space-y-1">
          <DialogTitle className="text-heading-lg">Deposit confirmed</DialogTitle>
          <p className="text-[13px] text-ink-2">
            You now hold a position in @{creator.handle}.
          </p>
        </div>
      </div>

      <article className="rounded-md border border-line bg-surface-2/60 p-3 space-y-2 text-[13px]">
        <Line label="Deposited" value={`$${amount.toFixed(2)}`} />
        <Line label="Shares received" value={sharesReceived.toFixed(2)} />
        <Line label="Total position" value={`$${newHolding.toFixed(2)}`} emphasis />
      </article>

      {depositTxHash ? (
        <Link
          href={`${explorer}/tx/${depositTxHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1 text-[12px] text-ink-2 hover:text-brand font-mono"
        >
          {shortenHash(depositTxHash, 6)}
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

function TxRow({
  index,
  label,
  description,
  status,
  hash,
  explorer,
}: {
  index: number;
  label: string;
  description: string;
  status: TxStatus;
  hash: Hex | null;
  explorer: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-line bg-surface p-3">
      <span
        className={cn(
          "flex size-6 items-center justify-center rounded-full text-[11px] font-medium shrink-0",
          status === "done" && "bg-positive text-bg",
          status === "pending" && "bg-ink text-bg",
          status === "idle" && "bg-surface-2 text-ink-3 border border-line",
        )}
      >
        {status === "done" ? (
          <CheckCircle2 className="size-3.5" strokeWidth={2.5} />
        ) : status === "pending" ? (
          <Loader2 className="size-3.5 animate-spin" strokeWidth={2.5} />
        ) : (
          index
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        <div className="text-[12px] text-ink-2 leading-tight">{description}</div>
        {hash ? (
          <Link
            href={`${explorer}/tx/${hash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] text-ink-3 hover:text-brand inline-flex items-center gap-1 mt-0.5"
          >
            {shortenHash(hash, 4)}
            <ExternalLink className="size-2.5" />
          </Link>
        ) : null}
      </div>
      <span
        className={cn(
          "text-[11px] num shrink-0",
          status === "done" && "text-positive",
          status === "pending" && "text-ink-2",
          status === "idle" && "text-ink-3",
        )}
      >
        {status === "done" && "confirmed"}
        {status === "pending" && "pending…"}
        {status === "idle" && "waiting"}
      </span>
    </div>
  );
}
