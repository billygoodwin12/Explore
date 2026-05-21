import type { Config } from "wagmi";
import { switchChain as wagmiSwitchChain } from "wagmi/actions";

import {
  hyperliquidMainnet,
  hyperliquidTestnet,
  isSupportedChainId,
  type SupportedChainId,
} from "./hyperliquid";

export function expectedChainId(): SupportedChainId {
  const raw = process.env.NEXT_PUBLIC_CHAIN_ID;
  const parsed = raw ? Number(raw) : hyperliquidTestnet.id;
  return parsed === hyperliquidMainnet.id
    ? hyperliquidMainnet.id
    : hyperliquidTestnet.id;
}

export function isWrongChain(currentId: number | undefined): boolean {
  if (currentId === undefined) return false;
  if (!isSupportedChainId(currentId)) return true;
  return currentId !== expectedChainId();
}

export async function switchToExpectedChain(config: Config) {
  return wagmiSwitchChain(config, { chainId: expectedChainId() });
}
