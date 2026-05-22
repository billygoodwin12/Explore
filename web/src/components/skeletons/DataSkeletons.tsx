import { Skeleton } from "@/components/primitives/Skeleton";

export function ChartSkeleton() {
  return (
    <section className="rounded-lg border border-line bg-surface p-4 sm:p-6 space-y-3">
      <div className="flex items-center justify-between">
        <div className="space-y-1.5">
          <Skeleton shape="line" className="w-32 h-2.5" />
          <Skeleton shape="line" className="w-28 h-6" />
        </div>
        <div className="space-y-1.5 flex flex-col items-end">
          <Skeleton shape="line" className="w-10 h-2.5" />
          <Skeleton shape="line" className="w-16 h-5" />
        </div>
      </div>
      <Skeleton shape="rect" className="h-[220px] w-full" />
    </section>
  );
}

export function TableRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-lg border border-line bg-surface divide-y divide-line">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton shape="circle" className="size-6" />
          <Skeleton shape="line" className="w-28 h-3" />
          <div className="flex-1" />
          <Skeleton shape="line" className="w-16 h-3" />
          <Skeleton shape="line" className="w-12 h-3" />
        </div>
      ))}
    </div>
  );
}

export function PositionsSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-line bg-surface p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <Skeleton shape="pill" className="w-24 h-5" />
            <Skeleton shape="line" className="w-12 h-3" />
          </div>
          <div className="flex items-baseline justify-between">
            <Skeleton shape="line" className="w-24 h-7" />
            <Skeleton shape="line" className="w-16 h-5" />
          </div>
          <Skeleton shape="rect" className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

export function SearchResultsSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul>
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton shape="circle" className="size-6" />
          <div className="flex-1 space-y-1.5">
            <Skeleton shape="line" className="w-40 h-3" />
            <Skeleton shape="line" className="w-24 h-2.5" />
          </div>
          <Skeleton shape="line" className="w-16 h-4" />
        </li>
      ))}
    </ul>
  );
}
