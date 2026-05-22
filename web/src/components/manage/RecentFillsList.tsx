"use client";

import { ArrowDown, ArrowUp, ExternalLink } from "lucide-react";

import { EmptyState } from "@/components/primitives/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getChainById, hyperliquidTestnet } from "@/lib/chain/hyperliquid";
import { expectedChainId } from "@/lib/chain/switchChain";
import { shortenHash } from "@/lib/formatting/address";
import { formatRelative } from "@/lib/formatting/time";
import type { MockCreator } from "@/lib/mock/types";
import { cn } from "@/lib/utils";

export function RecentFillsList({ creator }: { creator: MockCreator }) {
  const fills = creator.recentFills.slice(0, 5);
  const explorer =
    (getChainById(expectedChainId()) ?? hyperliquidTestnet).blockExplorers
      .default.url;

  return (
    <section className="space-y-3">
      <header className="flex items-center justify-between">
        <h2 className="text-label">Recent fills</h2>
        <a
          href={`${explorer}/address/${creator.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-ink-3 hover:text-ink transition-colors"
        >
          View all on Hyperscan →
        </a>
      </header>

      {fills.length === 0 ? (
        <EmptyState
          title="No fills yet"
          description="Trades you execute from this vault will land here."
        />
      ) : (
        <div className="rounded-lg border border-line bg-surface overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Side</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Fee</TableHead>
                <TableHead>Tx</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fills.map((f) => {
                const SideIcon = f.side === "long" ? ArrowUp : ArrowDown;
                return (
                  <TableRow key={f.id}>
                    <TableCell className="text-[12px] text-ink-2">
                      {formatRelative(f.filledAt)}
                    </TableCell>
                    <TableCell className="font-mono text-[13px]">
                      {f.asset}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.04em] border font-mono",
                          f.side === "long"
                            ? "bg-positive-soft-bg text-positive-soft-text border-positive/25"
                            : "bg-negative-soft-bg text-negative-soft-text border-negative/25",
                        )}
                      >
                        <SideIcon className="size-3" strokeWidth={2.5} />
                        {f.side}
                      </span>
                    </TableCell>
                    <TableCell className="num text-right text-[13px]">
                      {f.coins.toFixed(f.coins < 1 ? 4 : 2)}
                    </TableCell>
                    <TableCell className="num text-right text-[13px]">
                      ${f.price.toFixed(2)}
                    </TableCell>
                    <TableCell className="num text-right text-[12px] text-ink-3">
                      ${f.feeUsdc.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <a
                        href={`${explorer}/tx/${f.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[12px] text-ink-2 hover:text-brand inline-flex items-center gap-1"
                      >
                        {shortenHash(f.txHash, 4)}
                        <ExternalLink className="size-3" strokeWidth={2} />
                      </a>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
