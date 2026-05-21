"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar } from "@/components/primitives/Avatar";
import { NumCell } from "@/components/primitives/NumCell";
import { Pill } from "@/components/primitives/Pill";
import { SkinInGamePill } from "@/components/primitives/SkinInGamePill";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSearchCreators } from "@/lib/hooks/useSearchCreators";

export function SearchBar() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { data: results = [] } = useSearchCreators({
    query,
    sort: "tvl-desc",
    limit: 8,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isK = e.key.toLowerCase() === "k";
      if ((e.metaKey || e.ctrlKey) && isK) {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  function go(handle: string) {
    setOpen(false);
    setQuery("");
    router.push(`/creator/${handle}`);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2 h-8 px-2 min-[720px]:px-3 rounded-full border border-line bg-surface hover:bg-surface-2 transition-colors text-ink-3"
        aria-label="Search creators"
      >
        <Search className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="hidden min-[720px]:inline text-[13px]">
          Search creators
        </span>
        <kbd className="hidden min-[720px]:inline-flex items-center justify-center h-5 px-1.5 ml-1 rounded border border-line bg-surface-2 text-[10px] font-mono text-ink-3">
          ⌘K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="p-0 max-w-xl sm:max-w-2xl gap-0 overflow-hidden"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Search creators</DialogTitle>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
            <Search className="size-4 text-ink-3" strokeWidth={1.75} />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by handle, name, or thesis"
              className="border-0 shadow-none focus-visible:ring-0 px-0 h-8 text-[14px]"
            />
            <kbd className="hidden sm:inline-flex items-center justify-center h-5 px-1.5 rounded border border-line bg-surface-2 text-[10px] font-mono text-ink-3">
              ESC
            </kbd>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {results.length === 0 ? (
              <div className="px-4 py-12 text-center text-[13px] text-ink-3">
                No creators match &ldquo;{query}&rdquo;.
              </div>
            ) : (
              <ul>
                {results.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/creator/${c.handle}`}
                      onClick={() => go(c.handle)}
                      className="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-2 transition-colors"
                    >
                      <Avatar name={c.displayName} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-ink truncate">
                            {c.displayName}
                          </span>
                          <span className="text-[12px] text-ink-3 num truncate">
                            @{c.handle}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Pill tone="neutral" className="text-[10px] py-0">
                            {c.assetClass}
                          </Pill>
                          <SkinInGamePill
                            stakeBps={c.creatorStakeBps}
                            inCure={c.cureWindowStartedAt !== null}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <NumCell
                          value={Math.round(c.tvl).toLocaleString()}
                          prefix="$"
                          size="sm"
                        />
                        <NumCell
                          value={`${c.pnl30dBps > 0 ? "+" : ""}${(c.pnl30dBps / 100).toFixed(2)}%`}
                          size="sm"
                          sentiment={c.pnl30dBps >= 0 ? "positive" : "negative"}
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
