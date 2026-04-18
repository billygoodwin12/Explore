import { getEnv } from "../config/index.js";

export interface SizingInput {
  whaleTradeUsdc: number;
  whaleBalanceUsdc: number;
  ourBalanceUsdc: number;
  sizingMultiplier: number;
}

export interface SizingResult {
  sizeUsdc: number;
  skipped: boolean;
  reason?: string;
}

export function computeCopySize(input: SizingInput): SizingResult {
  const env = getEnv();

  if (input.whaleBalanceUsdc <= 0) {
    return { sizeUsdc: 0, skipped: true, reason: "UNKNOWN_WHALE_BALANCE" };
  }
  if (input.ourBalanceUsdc <= 0) {
    return { sizeUsdc: 0, skipped: true, reason: "NO_BALANCE" };
  }

  const ratio = input.whaleTradeUsdc / input.whaleBalanceUsdc;
  let sizeUsdc = ratio * input.ourBalanceUsdc * input.sizingMultiplier;

  if (sizeUsdc < env.MIN_STAKE_USDC) {
    return { sizeUsdc, skipped: true, reason: "BELOW_MIN_STAKE" };
  }

  sizeUsdc = Math.min(sizeUsdc, env.MAX_STAKE_USDC);
  return { sizeUsdc, skipped: false };
}
