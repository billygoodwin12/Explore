"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useAccount } from "wagmi";

import { assertMockOnly } from "@/lib/hooks/_dev";
import { getMockStore } from "@/lib/mock/store";
import type { Hex, MockUserShare, QueryLike } from "@/lib/mock/types";

export type UserShareView = {
  share: MockUserShare;
  pricePerShare: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlBps: number;
};

export function useUserShares(
  creatorId: Hex | undefined,
): QueryLike<UserShareView | null> {
  assertMockOnly("useUserShares");
  const store = getMockStore();
  const { address } = useAccount();
  const version = useSyncExternalStore(
    store.subscribe,
    store.getVersion,
    store.getServerVersion,
  );

  const data = useMemo<UserShareView | null>(() => {
    void version;
    if (!creatorId || !address) return null;
    const share = store.getUserShares(address as Hex, creatorId);
    if (!share) return null;
    const creator = store.getCreator(creatorId);
    const pricePerShare = creator?.pricePerShare ?? 1;
    const currentValue = share.shares * pricePerShare;
    const unrealizedPnl = currentValue - share.costBasis;
    const unrealizedPnlBps =
      share.costBasis > 0
        ? Math.round((unrealizedPnl / share.costBasis) * 10_000)
        : 0;
    return {
      share,
      pricePerShare,
      currentValue,
      unrealizedPnl,
      unrealizedPnlBps,
    };
  }, [version, creatorId, address, store]);

  return { data, isLoading: false, isError: false, error: null };
}
