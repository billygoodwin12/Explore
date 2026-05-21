"use client";

import { Eye, EyeOff } from "lucide-react";

import { NumCell } from "@/components/primitives/NumCell";
import { useHydrated } from "@/lib/hooks/useHydrated";
import {
  usePreferencesStore,
  type StatCardId,
} from "@/lib/store/preferences";
import { cn } from "@/lib/utils";

type PortfolioStatsCardProps = {
  id: StatCardId;
  label: string;
  value: string;
  sub?: string;
  sentiment?: "neutral" | "positive" | "negative" | "brand";
  subSentiment?: "neutral" | "positive" | "negative" | "brand";
};

const MASKED = "•••••••";

export function PortfolioStatsCard({
  id,
  label,
  value,
  sub,
  sentiment = "neutral",
  subSentiment = "neutral",
}: PortfolioStatsCardProps) {
  const hydrated = useHydrated();
  const masked = usePreferencesStore((s) => s.maskedStatCards[id]);
  const toggle = usePreferencesStore((s) => s.toggleStatMask);
  const isMasked = hydrated && masked;

  return (
    <article className="rounded-lg border border-line bg-surface p-5 space-y-2">
      <div className="flex items-start justify-between">
        <div className="text-label">{label}</div>
        <button
          type="button"
          onClick={() => toggle(id)}
          className="text-ink-3 hover:text-ink transition-colors"
          aria-label={isMasked ? `Show ${label}` : `Hide ${label}`}
          aria-pressed={isMasked}
        >
          {isMasked ? (
            <EyeOff className="size-4" strokeWidth={1.75} />
          ) : (
            <Eye className="size-4" strokeWidth={1.75} />
          )}
        </button>
      </div>
      <div className={cn(isMasked && "select-none")}>
        <NumCell
          value={isMasked ? MASKED : value}
          size="xl"
          sentiment={isMasked ? "neutral" : sentiment}
        />
      </div>
      {sub ? (
        <NumCell
          value={isMasked ? MASKED : sub}
          size="sm"
          sentiment={isMasked ? "neutral" : subSentiment}
          className="text-ink-3"
        />
      ) : null}
    </article>
  );
}
