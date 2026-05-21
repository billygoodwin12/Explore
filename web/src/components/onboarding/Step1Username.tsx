"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  checkUsernameFormat,
  checkUsernameReserved,
  mockOnChainAvailability,
} from "@/lib/onboarding/validateUsername";
import { cn } from "@/lib/utils";

type Status =
  | { kind: "idle" }
  | { kind: "invalid"; reason: string }
  | { kind: "checking" }
  | { kind: "available" }
  | { kind: "taken" };

type Step1Props = {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
};

export function Step1Username({ value, onChange, onNext }: Step1Props) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    if (value.length === 0) {
      setStatus({ kind: "idle" });
      return;
    }
    const format = checkUsernameFormat(value);
    if (!format.ok) {
      setStatus({ kind: "invalid", reason: format.reason });
      return;
    }
    const reserved = checkUsernameReserved(value);
    if (!reserved.ok) {
      setStatus({ kind: "invalid", reason: reserved.reason });
      return;
    }
    setStatus({ kind: "checking" });

    let cancelled = false;
    const t = setTimeout(async () => {
      const result = await mockOnChainAvailability(value);
      if (cancelled) return;
      setStatus({ kind: result === "available" ? "available" : "taken" });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [value]);

  const canProceed = status.kind === "available";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-heading-lg">Pick a username</h2>
        <p className="text-[14px] text-ink-2 leading-relaxed">
          This is how depositors will find you. It will be your vault URL on
          Theorise.
        </p>
      </header>

      <div className="space-y-2">
        <label className="text-label" htmlFor="username-input">
          Username
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3 font-mono text-[15px]">
            theorise.app/
          </span>
          <Input
            id="username-input"
            value={value}
            onChange={(e) => onChange(e.target.value.toLowerCase().trim())}
            placeholder="katanablade"
            autoFocus
            spellCheck={false}
            autoComplete="off"
            inputMode="text"
            maxLength={15}
            className="font-mono text-[15px] pl-[105px] pr-10 h-11"
            aria-invalid={status.kind === "invalid" || status.kind === "taken"}
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2">
            <StatusIcon status={status} />
          </span>
        </div>
        <StatusMessage status={status} />
        <p className="text-[11px] text-ink-3 leading-relaxed">
          3–15 characters. Lowercase letters, digits, and underscore. Must
          start with a letter.
        </p>
      </div>

      <div className="flex justify-end">
        <Button
          variant="primary"
          size="default"
          onClick={onNext}
          disabled={!canProceed}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status.kind === "checking") {
    return <Loader2 className="size-4 animate-spin text-ink-3" strokeWidth={2} />;
  }
  if (status.kind === "available") {
    return <CheckCircle2 className="size-4 text-positive" strokeWidth={2} />;
  }
  if (status.kind === "invalid" || status.kind === "taken") {
    return <XCircle className="size-4 text-negative" strokeWidth={2} />;
  }
  return null;
}

function StatusMessage({ status }: { status: Status }) {
  if (status.kind === "idle") return null;
  return (
    <p
      className={cn(
        "text-[12px] leading-tight num",
        status.kind === "available" && "text-positive",
        status.kind === "checking" && "text-ink-3",
        (status.kind === "invalid" || status.kind === "taken") && "text-negative",
      )}
    >
      {status.kind === "checking" && "Checking availability on chain…"}
      {status.kind === "available" && "Available"}
      {status.kind === "taken" && "Already taken on chain — pick something else"}
      {status.kind === "invalid" && status.reason}
    </p>
  );
}
