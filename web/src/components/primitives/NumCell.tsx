import { cn } from "@/lib/utils";

export type NumCellSentiment =
  | "neutral"
  | "positive"
  | "negative"
  | "brand"
  | "auto";
export type NumCellSize = "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<NumCellSize, string> = {
  sm: "text-[12px] leading-4",
  md: "text-[14px] leading-5",
  lg: "text-[20px] leading-6",
  xl: "text-[28px] leading-7",
};

type ResolvedSentiment = "neutral" | "positive" | "negative" | "brand";

const sentimentClasses: Record<ResolvedSentiment, string> = {
  neutral: "text-ink",
  positive: "text-positive",
  negative: "text-negative",
  brand: "text-brand",
};

/**
 * "auto" derives positive/negative from the value's sign — use it only for
 * gain/loss numbers. Non-performance values (counts, balances) stay neutral.
 */
function resolveAuto(value: string | number): ResolvedSentiment {
  if (typeof value === "number") {
    if (value > 0) return "positive";
    if (value < 0) return "negative";
    return "neutral";
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) return "positive";
  if (trimmed.startsWith("-") || trimmed.startsWith("−")) return "negative";
  return "neutral";
}

type NumCellProps = {
  value: string | number;
  sentiment?: NumCellSentiment;
  size?: NumCellSize;
  align?: "left" | "right";
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  className?: string;
  title?: string;
};

export function NumCell({
  value,
  sentiment = "neutral",
  size = "md",
  align = "left",
  prefix,
  suffix,
  className,
  title,
}: NumCellProps) {
  const resolved: ResolvedSentiment =
    sentiment === "auto" ? resolveAuto(value) : sentiment;

  return (
    <span
      className={cn(
        "num inline-flex items-baseline",
        align === "right" && "justify-end",
        sizeClasses[size],
        sentimentClasses[resolved],
        className,
      )}
      title={title}
    >
      {prefix !== undefined ? (
        <span className="mr-0.5 text-ink-3 font-sans not-italic">
          {prefix}
        </span>
      ) : null}
      <span>{value}</span>
      {suffix !== undefined ? (
        <span className="ml-1 text-ink-3 font-sans text-[0.85em]">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}
