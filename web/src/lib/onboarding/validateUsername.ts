import { isReservedName } from "@/lib/onboarding/reservedNames";

export const USERNAME_RE = /^[a-z][a-z0-9_]{2,14}$/;

export type FormatResult =
  | { ok: true }
  | { ok: false; reason: string };

export function checkUsernameFormat(value: string): FormatResult {
  if (value.length === 0) return { ok: false, reason: "" };
  if (value.length < 3) return { ok: false, reason: "Too short — min 3 characters" };
  if (value.length > 15) return { ok: false, reason: "Too long — max 15 characters" };
  if (!/^[a-z]/.test(value))
    return { ok: false, reason: "Must start with a lowercase letter" };
  if (!/^[a-z0-9_]+$/.test(value))
    return { ok: false, reason: "Only lowercase letters, digits, and underscore" };
  if (!USERNAME_RE.test(value))
    return { ok: false, reason: "Invalid format" };
  return { ok: true };
}

export function checkUsernameReserved(value: string): FormatResult {
  if (isReservedName(value))
    return { ok: false, reason: "Reserved name — pick something else" };
  return { ok: true };
}

const ON_CHAIN_TAKEN: ReadonlySet<string> = new Set([
  "alice",
  "satoshi",
  "vitalik",
  "katanablade",
  "hyperliquid",
  "billy",
  "claude",
  "anthropic",
]);

export type AvailabilityResult = "available" | "taken";

export function mockOnChainAvailability(value: string): Promise<AvailabilityResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(ON_CHAIN_TAKEN.has(value.toLowerCase()) ? "taken" : "available");
    }, 700);
  });
}
