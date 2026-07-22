export function formatUnits(value: bigint, decimals: number, dp = 4): string {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = v % base;
  let fracStr = frac.toString().padStart(decimals, "0").slice(0, dp).replace(/0+$/, "");
  const wholeStr = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${wholeStr}${fracStr ? "." + fracStr : ""}`;
}

export function parseAmount(input: string, decimals: number): bigint | null {
  const t = input.trim();
  if (!/^\d+(\.\d*)?$/.test(t)) return null;
  const [whole, frac = ""] = t.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  try {
    return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fracPadded || "0");
  } catch {
    return null;
  }
}

export function truncAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export function formatWad(priceWad: bigint, dp = 6): string {
  return formatUnits(priceWad, 18, dp);
}

const YEAR_SECONDS = 365 * 24 * 3600;

/// Display APR from price (float math fine for display only): (1e18/price - 1) * (365d/ttm)
export function aprFromPrice(priceWad: bigint, ttmSeconds: number): number {
  if (priceWad <= 0n || ttmSeconds <= 0) return 0;
  const p = Number(priceWad) / 1e18;
  return (1 / p - 1) * (YEAR_SECONDS / ttmSeconds);
}

/// Maker input APR -> target price float: P = 1/(1 + apr * ttm/365d)
export function priceFromApr(apr: number, ttmSeconds: number): bigint {
  const p = 1 / (1 + apr * (ttmSeconds / YEAR_SECONDS));
  return BigInt(Math.round(p * 1e18));
}

export function formatApr(apr: number): string {
  return `${(apr * 100).toFixed(2)}%`;
}

export function countdown(toUnix: number): string {
  const s = toUnix - Math.floor(Date.now() / 1000);
  if (s <= 0) return "expired";
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `T−${d}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m`;
  if (h > 0) return `T−${h}h ${String(m).padStart(2, "0")}m`;
  return `T−${m}m`;
}
