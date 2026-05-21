import { cn } from "@/lib/utils";

export type NumCellSentiment = "neutral" | "positive" | "negative" | "brand";
export type NumCellSize = "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<NumCellSize, string> = {
  sm: "text-[12px] leading-4",
  md: "text-[14px] leading-5",
  lg: "text-[20px] leading-6 font-medium",
  xl: "text-[28px] leading-7 font-semibold tracking-[-0.01em]",
};

const sentimentClasses: Record<NumCellSentiment, string> = {
  neutral: "text-ink",
  positive: "text-positive",
  negative: "text-negative",
  brand: "text-brand",
};

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
  return (
    <span
      className={cn(
        "num inline-flex items-baseline",
        align === "right" && "justify-end",
        sizeClasses[size],
        sentimentClasses[sentiment],
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
