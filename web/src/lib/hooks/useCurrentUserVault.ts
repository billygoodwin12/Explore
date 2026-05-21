"use client";

import { useMemo, useSyncExternalStore } from "react";
import { useAccount } from "wagmi";

import { assertMockOnly } from "@/lib/hooks/_dev";
import { getMockStore } from "@/lib/mock/store";
import type { MockCreator, QueryLike } from "@/lib/mock/types";

const MOCK_OWNED_HANDLE = "alice.eth";

export function useCurrentUserVault(): QueryLike<MockCreator | null> {
  assertMockOnly("useCurrentUserVault");
  const store = getMockStore();
  const { isConnected } = useAccount();
  const version = useSyncExternalStore(
    store.subscribe,
    store.getVersion,
    store.getServerVersion,
  );

  const data = useMemo<MockCreator | null>(() => {
    void version;
    if (!isConnected) return null;
    return store.getCreatorByHandle(MOCK_OWNED_HANDLE) ?? null;
  }, [version, isConnected, store]);

  return { data, isLoading: false, isError: false, error: null };
}
