import { http, createConfig } from 'wagmi';
import { arbitrumSepolia } from 'wagmi/chains';
import { injected, metaMask, coinbaseWallet } from 'wagmi/connectors';

/**
 * Hyperliquid testnet uses Arbitrum Sepolia for bridging.
 * For now we connect wallets on Arbitrum Sepolia — the Hyperliquid
 * API itself is accessed via REST/WebSocket, not on-chain calls.
 *
 * When moving to mainnet, switch to Arbitrum One.
 */
export const config = createConfig({
  chains: [arbitrumSepolia],
  connectors: [
    metaMask(),
    injected({ target: 'phantom' }),
    coinbaseWallet({ appName: 'Theorise' }),
  ],
  transports: {
    [arbitrumSepolia.id]: http(),
  },
  ssr: true,
});
