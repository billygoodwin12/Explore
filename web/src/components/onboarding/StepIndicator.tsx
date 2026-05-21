import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type StepIndicatorProps = {
  current: number;
  steps: string[];
};

export function StepIndicator({ current, steps }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const done = stepNum < current;
        const active = stepNum === current;
        return (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-[11px] font-medium border",
                  done && "bg-positive border-positive text-bg",
                  active && "bg-ink border-ink text-bg",
                  !done && !active && "bg-surface border-line text-ink-3",
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={2.5} /> : stepNum}
              </span>
              <span
                className={cn(
                  "text-[12px] font-medium tracking-wide hidden sm:inline",
                  (done || active) ? "text-ink" : "text-ink-3",
                )}
              >
                {label}
              </span>
            </div>
            {i < steps.length - 1 ? (
              <div className="flex-1 h-px bg-line min-w-4" />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
