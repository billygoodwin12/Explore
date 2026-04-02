import { http, createConfig } from 'wagmi';
import { arbitrumSepolia } from 'wagmi/chains';
import { getDefaultConfig } from '@rainbow-me/rainbowkit';

/**
 * Hyperliquid testnet uses Arbitrum Sepolia for bridging.
 * For now we connect wallets on Arbitrum Sepolia — the Hyperliquid
 * API itself is accessed via REST/WebSocket, not on-chain calls.
 *
 * When moving to mainnet, switch to Arbitrum One.
 */
export const config = getDefaultConfig({
  appName: 'Theorise',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'placeholder',
  chains: [arbitrumSepolia],
  transports: {
    [arbitrumSepolia.id]: http(),
  },
  ssr: true,
});
