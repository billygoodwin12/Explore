import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatBps } from "@/lib/formatting/money";

const STAKE_FLOOR_BPS = 500;

type SkinInGameTone = "healthy" | "at-floor" | "below-floor" | "in-cure";

function resolveTone(stakeBps: number, inCure: boolean): SkinInGameTone {
  if (inCure) return "in-cure";
  if (stakeBps < STAKE_FLOOR_BPS) return "below-floor";
  if (stakeBps < STAKE_FLOOR_BPS + 50) return "at-floor";
  return "healthy";
}

const toneClasses: Record<SkinInGameTone, string> = {
  healthy: "bg-positive/10 text-positive border-positive/20",
  "at-floor": "bg-warning/10 text-warning border-warning/30",
  "below-floor": "bg-negative/10 text-negative border-negative/20",
  "in-cure": "bg-brand-soft text-ink border-brand/30",
};

const toneLabel: Record<SkinInGameTone, string> = {
  healthy: "healthy",
  "at-floor": "at floor",
  "below-floor": "below floor",
  "in-cure": "in cure",
};

type SkinInGamePillProps = {
  stakeBps: number;
  inCure?: boolean;
  className?: string;
};

export function SkinInGamePill({
  stakeBps,
  inCure = false,
  className,
}: SkinInGamePillProps) {
  const tone = resolveTone(stakeBps, inCure);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium",
            toneClasses[tone],
            className,
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full",
              tone === "healthy" && "bg-positive",
              tone === "at-floor" && "bg-warning",
              tone === "below-floor" && "bg-negative",
              tone === "in-cure" && "bg-brand",
            )}
          />
          <span className="num">{formatBps(stakeBps)}</span>
          <span className="uppercase tracking-[0.04em] text-[10px] opacity-80">
            skin
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <div className="text-[12px]">
          Creator stake: <span className="num">{formatBps(stakeBps)}</span>
          <br />
          Floor: <span className="num">{formatBps(STAKE_FLOOR_BPS)}</span> · {toneLabel[tone]}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
