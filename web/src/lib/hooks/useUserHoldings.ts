"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useAccount } from "wagmi";

import { assertMockOnly } from "@/lib/hooks/_dev";
import { getMockStore } from "@/lib/mock/store";
import type {
  Hex,
  MockCreator,
  MockUserShare,
  QueryLike,
} from "@/lib/mock/types";

export type Holding = {
  creator: MockCreator;
  share: MockUserShare;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlBps: number;
};

const EMPTY: Holding[] = [];

export function useUserHoldings(): QueryLike<Holding[]> {
  assertMockOnly("useUserHoldings");
  const store = getMockStore();
  const { address } = useAccount();
  const version = useSyncExternalStore(
    store.subscribe,
    store.getVersion,
    store.getServerVersion,
  );

  const data = useMemo<Holding[]>(() => {
    void version;
    if (!address) return EMPTY;
    const shares = store.getAllUserShares(address as Hex);
    if (shares.length === 0) return EMPTY;
    return shares
      .map((share) => {
        const creator = store.getCreator(share.creatorId);
        if (!creator) return null;
        const currentValue = share.shares * creator.pricePerShare;
        const unrealizedPnl = currentValue - share.costBasis;
        const unrealizedPnlBps =
          share.costBasis > 0
            ? Math.round((unrealizedPnl / share.costBasis) * 10_000)
            : 0;
        return { creator, share, currentValue, unrealizedPnl, unrealizedPnlBps };
      })
      .filter((h): h is Holding => h !== null);
  }, [version, address, store]);

  return { data, isLoading: false, isError: false, error: null };
}
