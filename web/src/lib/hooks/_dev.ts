export const USE_MOCK_CONTRACTS =
  process.env.NEXT_PUBLIC_USE_MOCK_CONTRACTS !== "false";

export function devLog(...args: unknown[]) {
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    console.log("[theorise:mock]", ...args);
  }
}

export function assertMockOnly(name: string) {
  if (!USE_MOCK_CONTRACTS) {
    throw new Error(
      `${name} is mock-only; NEXT_PUBLIC_USE_MOCK_CONTRACTS is false but no on-chain implementation exists yet.`,
    );
  }
}
