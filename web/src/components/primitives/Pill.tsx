import { cn } from "@/lib/utils";

export type PillTone =
  | "neutral"
  | "brand"
  | "positive"
  | "negative"
  | "warning";

const toneClasses: Record<PillTone, string> = {
  neutral: "bg-surface-2 text-ink-2 border-line",
  brand: "bg-brand-soft text-ink border-brand/20",
  positive:
    "bg-positive-soft-bg text-positive-soft-text border-positive/25",
  negative:
    "bg-negative-soft-bg text-negative-soft-text border-negative/25",
  warning: "bg-warning/10 text-warning border-warning/30",
};

type PillProps = {
  children: React.ReactNode;
  tone?: PillTone;
  className?: string;
  dot?: boolean;
};

export function Pill({ children, tone = "neutral", className, dot = false }: PillProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em]",
        toneClasses[tone],
        className,
      )}
    >
      {dot ? (
        <span
          className={cn(
            "size-1.5 rounded-full",
            tone === "neutral" && "bg-ink-3",
            tone === "brand" && "bg-brand",
            tone === "positive" && "bg-positive",
            tone === "negative" && "bg-negative",
            tone === "warning" && "bg-warning",
          )}
        />
      ) : null}
      {children}
    </span>
  );
}
