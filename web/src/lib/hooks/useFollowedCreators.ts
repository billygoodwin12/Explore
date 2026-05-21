"use client";

import { useMemo, useSyncExternalStore } from "react";

import { assertMockOnly } from "@/lib/hooks/_dev";
import { getMockStore } from "@/lib/mock/store";
import type { MockCreator, QueryLike } from "@/lib/mock/types";

const EMPTY: MockCreator[] = [];

export function useFollowedCreators(): QueryLike<MockCreator[]> & {
  follow: (id: MockCreator["id"]) => void;
  unfollow: (id: MockCreator["id"]) => void;
} {
  assertMockOnly("useFollowedCreators");
  const store = getMockStore();
  const version = useSyncExternalStore(
    store.subscribe,
    store.getVersion,
    store.getServerVersion,
  );

  const data = useMemo<MockCreator[]>(() => {
    void version;
    const ids = store.getFollowedIds();
    if (ids.length === 0) return EMPTY;
    return ids
      .map((id) => store.getCreator(id))
      .filter((c): c is MockCreator => Boolean(c));
  }, [version, store]);

  return {
    data,
    isLoading: false,
    isError: false,
    error: null,
    follow: store.follow,
    unfollow: store.unfollow,
  };
}
