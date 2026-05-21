"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useAccount } from "wagmi";

import { assertMockOnly } from "@/lib/hooks/_dev";
import { getMockStore } from "@/lib/mock/store";
import type { Hex, MockCreator, QueryLike } from "@/lib/mock/types";

export function useUserVault(): QueryLike<MockCreator | null> {
  assertMockOnly("useUserVault");
  const store = getMockStore();
  const { address } = useAccount();
  const version = useSyncExternalStore(
    store.subscribe,
    store.getVersion,
    store.getServerVersion,
  );

  const data = useMemo<MockCreator | null>(() => {
    void version;
    return store.getUserOwnVault(address as Hex | undefined);
  }, [version, address, store]);

  return { data, isLoading: false, isError: false, error: null };
}
