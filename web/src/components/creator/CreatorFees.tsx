import { formatBps } from "@/lib/formatting/money";
import type { MockCreator } from "@/lib/mock/types";

type FeeRow = {
  label: string;
  bps: number;
  description: string;
};

export function CreatorFees({ creator }: { creator: MockCreator }) {
  const rows: FeeRow[] = [
    {
      label: "Management",
      bps: creator.mgmtFeeBps,
      description: "Annualized fee on NAV, accrued continuously.",
    },
    {
      label: "Performance",
      bps: creator.perfFeeBps,
      description: "Charged on realized gains, hybrid high-water mark.",
    },
    {
      label: "Deposit",
      bps: creator.depositFeeBps,
      description: "One-time fee on each deposit. Cap enforced by factory.",
    },
  ];

  return (
    <section className="rounded-lg border border-line bg-surface p-4 sm:p-6 space-y-4">
      <div className="text-label">Fee schedule</div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.label} className="py-3 first:pt-0 last:pb-0">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium text-ink">
                {r.label}
              </span>
              <span className="num text-heading-md text-ink">
                {formatBps(r.bps)}
              </span>
            </div>
            <p className="text-[12px] text-ink-2 leading-relaxed mt-0.5">
              {r.description}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
