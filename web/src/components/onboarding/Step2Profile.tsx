"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const DISPLAY_NAME_MAX = 32;
const BIO_MAX = 240;

type Step2Props = {
  username: string;
  displayName: string;
  bio: string;
  onChangeDisplayName: (v: string) => void;
  onChangeBio: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export function Step2Profile({
  username,
  displayName,
  bio,
  onChangeDisplayName,
  onChangeBio,
  onBack,
  onNext,
}: Step2Props) {
  const dnLen = displayName.length;
  const bioLen = bio.length;
  const dnValid = dnLen > 0 && dnLen <= DISPLAY_NAME_MAX;
  const bioValid = bioLen <= BIO_MAX;
  const canProceed = dnValid && bioValid;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-heading-lg">Profile basics</h2>
        <p className="text-[14px] text-ink-2 leading-relaxed">
          Tell depositors who you are and what your edge is. You can edit
          these later — but{" "}
          <span className="font-medium text-ink">@{username}</span> is
          permanent.
        </p>
      </header>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-label" htmlFor="display-name">
            Display name
          </label>
          <Counter current={dnLen} max={DISPLAY_NAME_MAX} />
        </div>
        <Input
          id="display-name"
          value={displayName}
          onChange={(e) => onChangeDisplayName(e.target.value.slice(0, DISPLAY_NAME_MAX))}
          placeholder="e.g. Alice Tanaka"
          maxLength={DISPLAY_NAME_MAX}
          className="h-11"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-label" htmlFor="bio">
            Bio
          </label>
          <Counter current={bioLen} max={BIO_MAX} />
        </div>
        <textarea
          id="bio"
          value={bio}
          onChange={(e) => onChangeBio(e.target.value.slice(0, BIO_MAX))}
          placeholder="ETH/BTC perps · momentum follower · risk-on bias"
          maxLength={BIO_MAX}
          rows={4}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-[14px] text-ink placeholder:text-ink-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background resize-none"
        />
      </div>

      <div className="rounded-md border border-warning/30 bg-warning/5 p-3 flex gap-3">
        <AlertTriangle
          className="size-4 text-warning shrink-0 mt-0.5"
          strokeWidth={2}
        />
        <div className="text-[12px] text-ink-2 leading-relaxed">
          <span className="font-medium text-ink">Username is permanent.</span>{" "}
          Once deployed, the vault contract is tied to{" "}
          <span className="num text-ink">@{username}</span> forever. Display
          name and bio can be edited.
        </div>
      </div>

      <div className="flex justify-between">
        <Button variant="ghost" size="default" onClick={onBack}>
          Back
        </Button>
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

function Counter({ current, max }: { current: number; max: number }) {
  const danger = current >= max;
  const warn = current >= max - 20;
  return (
    <span
      className={cn(
        "num text-[11px]",
        danger && "text-negative",
        !danger && warn && "text-warning",
        !danger && !warn && "text-ink-3",
      )}
    >
      {current}/{max}
    </span>
  );
}
