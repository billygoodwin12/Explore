"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type WeeklyReturnsProps = {
  weekly: number[];
};

export function CreatorWeeklyReturns({ weekly }: WeeklyReturnsProps) {
  const max = Math.max(...weekly.map((v) => Math.abs(v)));
  const wins = weekly.filter((v) => v > 0).length;
  const losses = weekly.filter((v) => v < 0).length;

  return (
    <section className="rounded-lg border border-line bg-surface p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-label">Weekly returns · last 12w</div>
          <div className="text-[12px] text-ink-3 mt-1">
            <span className="num text-positive">{wins}w</span> /{" "}
            <span className="num text-negative">{losses}l</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-1.5 items-end h-[88px]">
        {weekly.map((bps, i) => {
          const pos = bps >= 0;
          const heightPct =
            max === 0 ? 4 : Math.max(4, (Math.abs(bps) / max) * 100);
          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <div className="relative flex items-end justify-center h-full">
                  <div
                    className={
                      "w-full rounded-sm transition-colors " +
                      (pos ? "bg-positive/85" : "bg-negative/85")
                    }
                    style={{ height: `${heightPct}%` }}
                    aria-label={`Week ${12 - i}: ${(bps / 100).toFixed(2)}%`}
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="num text-[11px]">
                Week −{12 - i} · {bps > 0 ? "+" : ""}
                {(bps / 100).toFixed(2)}%
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
      <div className="grid grid-cols-12 gap-1.5 text-[10px] text-ink-3 num">
        <span className="col-span-1">−12w</span>
        <span className="col-span-10 text-center">past</span>
        <span className="col-span-1 text-right">now</span>
      </div>
    </section>
  );
}
