const COMPACT = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 2,
});

const FULL = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});

const INT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

export function formatUsd(value: number, opts: { compact?: boolean } = {}) {
  if (opts.compact) return `$${COMPACT.format(value)}`;
  return `$${FULL.format(value)}`;
}

export function formatUsdc(value: number, opts: { compact?: boolean } = {}) {
  if (opts.compact) return `${COMPACT.format(value)} USDC`;
  return `${FULL.format(value)} USDC`;
}

export function formatBps(bps: number) {
  return `${(bps / 100).toFixed(2)}%`;
}

export function formatPercent(value: number, fractionDigits = 2) {
  return `${value.toFixed(fractionDigits)}%`;
}

export function formatInteger(value: number) {
  return INT.format(value);
}
