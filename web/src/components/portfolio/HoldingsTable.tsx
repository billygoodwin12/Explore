"use client";

import { EyeOff, ExternalLink, MoreHorizontal, Wallet } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar } from "@/components/primitives/Avatar";
import { NumCell } from "@/components/primitives/NumCell";
import { SkinInGamePill } from "@/components/primitives/SkinInGamePill";
import { WithdrawModal } from "@/components/transactions/WithdrawModal";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Holding } from "@/lib/hooks/useUserHoldings";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { usePreferencesStore } from "@/lib/store/preferences";
import type { MockCreator } from "@/lib/mock/types";

type HoldingsTableProps = {
  holdings: Holding[];
};

export function HoldingsTable({ holdings }: HoldingsTableProps) {
  const router = useRouter();
  const hydrated = useHydrated();
  const hiddenIds = usePreferencesStore((s) => s.hiddenHoldings);
  const hideHolding = usePreferencesStore((s) => s.hideHolding);
  const unhideHolding = usePreferencesStore((s) => s.unhideHolding);

  const [withdrawingFor, setWithdrawingFor] = useState<MockCreator | null>(null);

  const hidden = hydrated ? new Set(hiddenIds) : new Set<string>();
  const visible = holdings.filter((h) => !hidden.has(h.creator.id));
  const hiddenCount = holdings.length - visible.length;

  if (holdings.length === 0) {
    return (
      <section className="rounded-lg border border-dashed border-line bg-surface p-10 text-center space-y-3">
        <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-surface-2 text-ink-3">
          <Wallet className="size-4" strokeWidth={1.75} />
        </span>
        <div className="text-[15px] font-medium text-ink">
          You’re not following anyone yet
        </div>
        <p className="text-[13px] text-ink-2 max-w-sm mx-auto">
          Browse creators, pick one with conviction, and deposit USDC to start
          building a position.
        </p>
        <div className="pt-1">
          <Button asChild variant="primary" size="default">
            <Link href="/">Browse creators</Link>
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-label">Your holdings · {visible.length}</h2>
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => {
              for (const id of hiddenIds) unhideHolding(id);
            }}
            className="text-[12px] text-ink-3 hover:text-ink transition-colors"
          >
            Show hidden ({hiddenCount}) ↺
          </button>
        ) : null}
      </header>

      <div className="rounded-lg border border-line bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Token / Vault</TableHead>
              <TableHead className="text-right">Shares</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">30d</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((h) => {
              const positive = h.creator.pnl30dBps >= 0;
              return (
                <TableRow key={h.creator.id}>
                  <TableCell>
                    <Link
                      href={`/${h.creator.handle}`}
                      className="flex items-center gap-2.5 hover:text-brand transition-colors"
                    >
                      <Avatar
                        name={h.creator.displayName}
                        size="sm"
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-medium text-ink truncate">
                          {h.creator.displayName}
                        </span>
                        <span className="num text-[11px] text-ink-3 truncate">
                          @{h.creator.handle}
                        </span>
                      </div>
                      <div className="ml-2">
                        <SkinInGamePill
                          stakeBps={h.creator.creatorStakeBps}
                          inCure={h.creator.cureWindowStartedAt !== null}
                        />
                      </div>
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">
                    <NumCell
                      value={Math.round(h.share.shares).toLocaleString()}
                      size="md"
                      align="right"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <NumCell
                      value={`$${Math.round(h.currentValue).toLocaleString()}`}
                      size="md"
                      align="right"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <NumCell
                      value={`${positive ? "+" : ""}${(h.creator.pnl30dBps / 100).toFixed(2)}%`}
                      size="md"
                      sentiment={positive ? "positive" : "negative"}
                      align="right"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Holding actions"
                        >
                          <MoreHorizontal />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => router.push(`/${h.creator.handle}`)}
                        >
                          <ExternalLink />
                          View profile
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setWithdrawingFor(h.creator)}
                        >
                          <Wallet />
                          Withdraw shares
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => hideHolding(h.creator.id)}
                        >
                          <EyeOff />
                          Hide from list
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {withdrawingFor ? (
        <WithdrawModal
          open={Boolean(withdrawingFor)}
          onOpenChange={(v) => {
            if (!v) setWithdrawingFor(null);
          }}
          creator={withdrawingFor}
        />
      ) : null}
    </section>
  );
}
