"use client";

import { useMemo, useSyncExternalStore } from "react";

import { assertMockOnly } from "@/lib/hooks/_dev";
import { getMockStore } from "@/lib/mock/store";
import type { Hex, MockCreator, QueryLike } from "@/lib/mock/types";

type Identifier = { id?: Hex; handle?: string };

function resolveArg(arg: Hex | string | Identifier): {
  id?: Hex;
  handle?: string;
} {
  if (typeof arg === "string") {
    return arg.startsWith("0x") ? { id: arg as Hex } : { handle: arg };
  }
  return { id: arg.id, handle: arg.handle };
}

export function useCreatorVault(
  arg: Hex | string | Identifier,
): QueryLike<MockCreator> {
  assertMockOnly("useCreatorVault");
  const store = getMockStore();
  const version = useSyncExternalStore(
    store.subscribe,
    store.getVersion,
    store.getServerVersion,
  );
  const { id, handle } = resolveArg(arg);

  const data = useMemo<MockCreator | undefined>(() => {
    void version;
    if (id) return store.getCreator(id);
    if (handle) return store.getCreatorByHandle(handle);
    return undefined;
  }, [version, id, handle, store]);

  return { data, isLoading: false, isError: false, error: null };
}
