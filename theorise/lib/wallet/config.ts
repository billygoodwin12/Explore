import { http, createConfig } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors';

/**
 * Hyperliquid mainnet uses Arbitrum One for bridging USDC.
 *
 * We rely on wagmi's multiInjectedProviderDiscovery (enabled by default)
 * to auto-detect MetaMask, Phantom, and other browser wallets.
 */
export const config = createConfig({
  chains: [arbitrum],
  connectors: [
    coinbaseWallet({ appName: 'Theorise' }),
  ],
  transports: {
    [arbitrum.id]: http(),
  },
  ssr: true,
});
