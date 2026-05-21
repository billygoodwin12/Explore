"use client";

import { Check, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MIN_STAKE_USDC = 100;
const DEPLOYMENT_FEE_USDC = 20;
const NETWORK_FEE_ESTIMATE_USDC = 0.42;

type TxStatus = "idle" | "pending" | "done";

type Step3Props = {
  username: string;
  onBack: () => void;
  onDeployed: () => void;
};

export function Step3Deposit({ username, onBack, onDeployed }: Step3Props) {
  const [amount, setAmount] = useState("100");
  const [approveStatus, setApproveStatus] = useState<TxStatus>("idle");
  const [deployStatus, setDeployStatus] = useState<TxStatus>("idle");

  const numeric = Number(amount);
  const isValid = !Number.isNaN(numeric) && numeric >= MIN_STAKE_USDC;
  const totalCost =
    (isValid ? numeric : 0) + DEPLOYMENT_FEE_USDC + NETWORK_FEE_ESTIMATE_USDC;

  const canApprove = isValid && approveStatus === "idle";
  const canDeploy =
    isValid && approveStatus === "done" && deployStatus === "idle";

  async function onApprove() {
    if (!canApprove) return;
    setApproveStatus("pending");
    const toastId = toast.loading("Approving USDC spend…");
    await delay(1600);
    toast.success("USDC approved", {
      id: toastId,
      description: "Ready to create vault.",
    });
    setApproveStatus("done");
  }

  async function onDeploy() {
    if (!canDeploy) return;
    setDeployStatus("pending");
    const toastId = toast.loading("Deploying vault…");
    await delay(2200);
    toast.success(`@${username} deployed`, {
      id: toastId,
      description: "Vault is live on Hyperliquid.",
    });
    setDeployStatus("done");
    onDeployed();
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-heading-lg">Initial deposit &amp; deploy</h2>
        <p className="text-[14px] text-ink-2 leading-relaxed">
          You need to seed{" "}
          <span className="num text-ink">${MIN_STAKE_USDC.toFixed(2)}</span>{" "}
          of your own USDC into the vault to start. This is the creator stake
          — your skin in the game.
        </p>
      </header>

      <div className="space-y-2">
        <label className="text-label" htmlFor="stake-amount">
          Stake (USDC)
        </label>
        <Input
          id="stake-amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="100.00"
          className="font-mono text-[15px] h-11"
          disabled={approveStatus !== "idle"}
        />
        <p className="text-[11px] text-ink-3">
          Minimum · <span className="num">${MIN_STAKE_USDC.toFixed(2)}</span>
        </p>
      </div>

      <div className="rounded-lg border border-line bg-surface-2/60 p-4 space-y-2 text-[13px]">
        <Row label="Initial stake" value={`$${(isValid ? numeric : 0).toFixed(2)}`} />
        <Row label="Deployment fee" value={`$${DEPLOYMENT_FEE_USDC.toFixed(2)}`} />
        <Row
          label="Network fee · est."
          value={`$${NETWORK_FEE_ESTIMATE_USDC.toFixed(2)}`}
          muted
        />
        <div className="border-t border-line pt-2 flex items-baseline justify-between">
          <span className="text-[13px] font-medium text-ink">Total</span>
          <span className="num text-heading-md text-ink">
            ${totalCost.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-label">Transactions</div>
        <TxRow
          index={1}
          label="Approve USDC"
          description="Allows the vault contract to pull your stake."
          status={approveStatus}
        />
        <TxRow
          index={2}
          label="Create vault"
          description={`Calls factory.createVault for @${username}.`}
          status={deployStatus}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-2 justify-between">
        <Button
          variant="ghost"
          size="default"
          onClick={onBack}
          disabled={approveStatus === "pending" || deployStatus === "pending"}
        >
          Back
        </Button>
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="default"
            onClick={onApprove}
            disabled={!canApprove}
          >
            {approveStatus === "pending" ? (
              <>
                <Loader2 className="animate-spin" />
                Approving…
              </>
            ) : approveStatus === "done" ? (
              <>
                <Check />
                Approved
              </>
            ) : (
              "1 · Approve USDC"
            )}
          </Button>
          <Button
            variant="primary-dark"
            size="default"
            onClick={onDeploy}
            disabled={!canDeploy}
          >
            {deployStatus === "pending" ? (
              <>
                <Loader2 className="animate-spin" />
                Deploying…
              </>
            ) : (
              "2 · Create vault"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function Row({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={cn("text-ink-2", muted && "text-ink-3")}>{label}</span>
      <span className={cn("num text-ink", muted && "text-ink-3")}>
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
}: {
  index: number;
  label: string;
  description: string;
  status: TxStatus;
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
          <Check className="size-3.5" strokeWidth={2.5} />
        ) : status === "pending" ? (
          <Loader2 className="size-3.5 animate-spin" strokeWidth={2.5} />
        ) : (
          index
        )}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        <div className="text-[12px] text-ink-2 leading-tight">{description}</div>
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
