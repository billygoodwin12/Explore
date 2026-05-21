"use client";

import { useMemo, useSyncExternalStore } from "react";

import { assertMockOnly } from "@/lib/hooks/_dev";
import { getMockStore } from "@/lib/mock/store";
import type { AssetClass, MockCreator, QueryLike } from "@/lib/mock/types";

export type CreatorSortKey =
  | "tvl-desc"
  | "tvl-asc"
  | "pnl30d-desc"
  | "pnl30d-asc"
  | "followers-desc"
  | "new-first";

export type SearchCreatorsArgs = {
  query?: string;
  assetClass?: AssetClass | "all";
  minStakeBps?: number;
  hideCured?: boolean;
  sort?: CreatorSortKey;
  limit?: number;
};

function sortFn(key: CreatorSortKey): (a: MockCreator, b: MockCreator) => number {
  switch (key) {
    case "tvl-desc":
      return (a, b) => b.tvl - a.tvl;
    case "tvl-asc":
      return (a, b) => a.tvl - b.tvl;
    case "pnl30d-desc":
      return (a, b) => b.pnl30dBps - a.pnl30dBps;
    case "pnl30d-asc":
      return (a, b) => a.pnl30dBps - b.pnl30dBps;
    case "followers-desc":
      return (a, b) => b.followCount - a.followCount;
    case "new-first":
      return (a, b) => b.joinedAt - a.joinedAt;
  }
}

export function useSearchCreators(
  args: SearchCreatorsArgs = {},
): QueryLike<MockCreator[]> {
  assertMockOnly("useSearchCreators");
  const store = getMockStore();
  const {
    query = "",
    assetClass = "all",
    minStakeBps,
    hideCured = false,
    sort = "tvl-desc",
    limit,
  } = args;

  const version = useSyncExternalStore(
    store.subscribe,
    store.getVersion,
    store.getServerVersion,
  );

  const data = useMemo<MockCreator[]>(() => {
    void version;
    const q = query.trim().toLowerCase();
    let out = store.getAllCreators();

    if (assetClass !== "all") {
      out = out.filter((c) => c.assetClass === assetClass);
    }
    if (q.length > 0) {
      out = out.filter(
        (c) =>
          c.handle.toLowerCase().includes(q) ||
          c.displayName.toLowerCase().includes(q) ||
          c.bio.toLowerCase().includes(q),
      );
    }
    if (minStakeBps !== undefined) {
      out = out.filter((c) => c.creatorStakeBps >= minStakeBps);
    }
    if (hideCured) {
      out = out.filter((c) => c.cureWindowStartedAt === null);
    }
    out.sort(sortFn(sort));
    if (limit !== undefined) out = out.slice(0, limit);
    return out;
  }, [version, query, assetClass, minStakeBps, hideCured, sort, limit, store]);

  return { data, isLoading: false, isError: false, error: null };
}
