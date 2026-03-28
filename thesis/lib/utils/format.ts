// ---------------------------------------------------------------------------
// Formatting utilities
// ---------------------------------------------------------------------------

import {
  ADDRESS_TRUNCATION_LENGTH,
  DEFAULT_PRICE_DECIMALS,
  FUNDING_RATE_DECIMALS,
} from './constants';

/**
 * Format a price with thousands separators and fixed decimal places.
 *
 * @example formatPrice(12345.678)    // "12,345.68"
 * @example formatPrice(0.00042, 5)   // "0.00042"
 */
export function formatPrice(
  price: number,
  decimals: number = DEFAULT_PRICE_DECIMALS,
): string {
  return price.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a value as a percentage string.
 * Positive values are prefixed with "+", negative values keep their "-".
 * Returns a tuple-style object so callers can apply colour classes.
 *
 * @example formatPercentage(12.5)   // "+12.50%"
 * @example formatPercentage(-3.2)   // "-3.20%"
 */
export function formatPercentage(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Return a Tailwind-compatible colour class for a percentage value.
 */
export function percentageColorClass(value: number): string {
  if (value > 0) return 'text-green-500';
  if (value < 0) return 'text-red-500';
  return 'text-gray-400';
}

/**
 * Truncate an Ethereum-style address to 0x7a3F...c92E form.
 */
export function formatAddress(address: string): string {
  if (!address || address.length < 10) return address;
  const len = ADDRESS_TRUNCATION_LENGTH;
  const prefix = address.slice(0, 2 + len); // include "0x"
  const suffix = address.slice(-len);
  return `${prefix}...${suffix}`;
}

/**
 * Format a number as USD currency.
 *
 * @example formatUSD(1234.5)    // "$1,234.50"
 * @example formatUSD(-500)      // "-$500.00"
 */
export function formatUSD(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return value < 0 ? `-$${formatted}` : `$${formatted}`;
}

/**
 * Compact number formatting: 1.2K, 3.4M, 1.1B, etc.
 *
 * @example formatNumber(1_234)       // "1.2K"
 * @example formatNumber(5_678_900)   // "5.7M"
 * @example formatNumber(42)          // "42"
 */
export function formatNumber(value: number): string {
  const abs = Math.abs(value);

  if (abs >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/**
 * Format a funding rate (typically a small fraction like 0.0001).
 * Displays as a percentage with sign.
 *
 * @example formatFundingRate(0.0003)  // "+0.0300%"
 * @example formatFundingRate(-0.0001) // "-0.0100%"
 */
export function formatFundingRate(rate: number): string {
  const pct = rate * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(FUNDING_RATE_DECIMALS)}%`;
}

/**
 * Format a Date or ISO-string into a human-friendly timestamp.
 *
 * @example formatTimestamp(new Date())   // "Mar 28, 2026 14:35"
 */
export function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;

  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/**
 * Format a relative time difference (e.g. "2m ago", "3h ago", "1d ago").
 */
export function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}
