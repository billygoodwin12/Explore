import { defineChain } from "viem";

export const hyperliquidTestnet = defineChain({
  id: 998,
  name: "Hyperliquid Testnet",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.hyperliquid-testnet.xyz/evm"] },
  },
  blockExplorers: {
    default: {
      name: "Hyperliquid Testnet Explorer",
      url: "https://explorer.hyperliquid-testnet.xyz",
    },
  },
  testnet: true,
});

export const hyperliquidMainnet = defineChain({
  id: 999,
  name: "Hyperliquid",
  nativeCurrency: { name: "HYPE", symbol: "HYPE", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.hyperliquid.xyz/evm"] },
  },
  blockExplorers: {
    default: {
      name: "Hyperliquid Explorer",
      url: "https://explorer.hyperliquid.xyz",
    },
  },
  testnet: false,
});

export const SUPPORTED_CHAINS = [hyperliquidTestnet, hyperliquidMainnet] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]["id"];

export function getChainById(id: number) {
  return SUPPORTED_CHAINS.find((c) => c.id === id);
}

export function isSupportedChainId(id: number | undefined): id is SupportedChainId {
  if (id === undefined) return false;
  return SUPPORTED_CHAINS.some((c) => c.id === id);
}
