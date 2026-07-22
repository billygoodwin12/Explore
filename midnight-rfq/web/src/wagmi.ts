import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { injected } from "wagmi/connectors";
import { CHAIN_ID } from "@shared/deployments";

export const RPC_URL: string = import.meta.env.VITE_RPC_URL ?? "https://sepolia.base.org";

export const chain = defineChain({
  id: CHAIN_ID,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  blockExplorers: { default: { name: "Basescan", url: "https://sepolia.basescan.org" } },
  testnet: true,
});

export const config = createConfig({
  chains: [chain],
  connectors: [injected()],
  transports: { [chain.id]: http(RPC_URL) },
});

export const EXPLORER = "https://sepolia.basescan.org";
