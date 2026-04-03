import { http, createConfig } from 'wagmi';
import { arbitrumSepolia } from 'wagmi/chains';
import { coinbaseWallet } from 'wagmi/connectors';

/**
 * Hyperliquid testnet uses Arbitrum Sepolia for bridging.
 *
 * We rely on wagmi's multiInjectedProviderDiscovery (enabled by default)
 * to auto-detect MetaMask, Phantom, and other browser wallets.
 * Only Coinbase Wallet needs an explicit connector since it has
 * a built-in onboarding flow.
 */
export const config = createConfig({
  chains: [arbitrumSepolia],
  connectors: [
    coinbaseWallet({ appName: 'Theorise' }),
  ],
  transports: {
    [arbitrumSepolia.id]: http(),
  },
  ssr: true,
});
