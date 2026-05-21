import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center gap-3 px-6 py-12 border border-dashed border-line rounded-lg bg-surface",
        className,
      )}
    >
      {Icon ? (
        <span className="flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink-3">
          <Icon className="size-5" strokeWidth={1.5} />
        </span>
      ) : null}
      <div className="space-y-1">
        <div className="text-[15px] font-medium text-ink">{title}</div>
        {description ? (
          <p className="text-[13px] text-ink-2 max-w-sm">{description}</p>
        ) : null}
      </div>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}
