"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMockStore } from "@/lib/mock/store";
import type { MockCreator } from "@/lib/mock/types";
import { cn } from "@/lib/utils";

const DEPOSIT_MAX_BPS = 100;
const PERF_MAX_BPS = 2000;
const DEPOSIT_TREASURY_SHARE = 0.2;
const PERF_TREASURY_SHARE = 0.1;

export function FeeSettings({ creator }: { creator: MockCreator }) {
  return (
    <section className="rounded-lg border border-line bg-surface p-5 sm:p-6 space-y-5">
      <div>
        <div className="text-label">Fee settings</div>
        <p className="text-[12px] text-ink-3 mt-1">
          Saving each fee calls the corresponding setter on the vault. Treasury
          split is enforced by the factory.
        </p>
      </div>

      <FeeRow
        kind="deposit"
        creator={creator}
        currentBps={creator.depositFeeBps}
        maxBps={DEPOSIT_MAX_BPS}
        treasuryShare={DEPOSIT_TREASURY_SHARE}
        label="Deposit fee"
        description="Charged on each deposit. 0 to 100 bps (1%)."
      />
      <div className="h-px bg-line" />
      <FeeRow
        kind="performance"
        creator={creator}
        currentBps={creator.perfFeeBps}
        maxBps={PERF_MAX_BPS}
        treasuryShare={PERF_TREASURY_SHARE}
        label="Performance fee"
        description="Charged on realized gains at withdrawal. 0 to 2000 bps (20%)."
      />
    </section>
  );
}

type FeeRowProps = {
  kind: "deposit" | "performance";
  creator: MockCreator;
  currentBps: number;
  maxBps: number;
  treasuryShare: number;
  label: string;
  description: string;
};

function FeeRow({
  kind,
  creator,
  currentBps,
  maxBps,
  treasuryShare,
  label,
  description,
}: FeeRowProps) {
  const [draft, setDraft] = useState<string>(String(currentBps));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(String(currentBps));
  }, [currentBps]);

  const numeric = Number(draft);
  const valid =
    !Number.isNaN(numeric) &&
    Number.isInteger(numeric) &&
    numeric >= 0 &&
    numeric <= maxBps;
  const dirty = valid && numeric !== currentBps;

  const creatorShare = valid ? Math.round(numeric * (1 - treasuryShare)) : 0;
  const treasuryShareBps = valid ? numeric - creatorShare : 0;

  async function onSave() {
    if (!dirty || saving) return;
    setSaving(true);
    const id = toast.loading(`Updating ${label.toLowerCase()}…`);
    await new Promise((r) => setTimeout(r, 1500));
    if (kind === "deposit") {
      getMockStore().setDepositFee(creator.id, numeric);
    } else {
      getMockStore().setPerformanceFee(creator.id, numeric);
    }
    toast.success(`${label} saved`, {
      id,
      description: `${(numeric / 100).toFixed(2)}% on chain.`,
    });
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="text-[13px] font-medium text-ink">{label}</div>
          <p className="text-[12px] text-ink-2 leading-tight mt-0.5">
            {description}
          </p>
        </div>
        <div className="text-right">
          <div className="text-label">Current</div>
          <div className="num text-heading-md text-ink">
            {(currentBps / 100).toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex-1">
          <div className="relative">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              className="font-mono text-[15px] h-10 pr-12"
              aria-invalid={!valid && draft.length > 0}
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-3 num">
              bps
            </span>
          </div>
          {draft.length > 0 && !valid ? (
            <p className="text-[11px] text-negative num mt-1">
              Must be an integer between 0 and {maxBps}
            </p>
          ) : (
            <p className="text-[11px] text-ink-3 num mt-1">
              0–{maxBps} bps · 1 bps = 0.01%
            </p>
          )}
        </div>
        <Button
          variant="primary"
          size="default"
          onClick={onSave}
          disabled={!dirty || saving}
        >
          {saving ? (
            <>
              <Loader2 className="animate-spin" />
              Saving…
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>

      <div
        className={cn(
          "rounded-md border border-line bg-surface-2/60 px-3 py-2 text-[12px]",
          !valid && "opacity-60",
        )}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-ink-2">
            Creator share ·{" "}
            <span className="num text-ink">
              {Math.round((1 - treasuryShare) * 100)}%
            </span>
          </span>
          <span className="num text-ink">
            {(creatorShare / 100).toFixed(2)}%
          </span>
        </div>
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-ink-2">
            Theorise share ·{" "}
            <span className="num text-ink">
              {Math.round(treasuryShare * 100)}%
            </span>
          </span>
          <span className="num text-ink-2">
            {(treasuryShareBps / 100).toFixed(2)}%
          </span>
        </div>
      </div>
    </div>
  );
}
