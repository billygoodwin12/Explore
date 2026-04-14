import { http, createConfig } from 'wagmi';
import { arbitrum } from 'wagmi/chains';

/**
 * Hyperliquid mainnet uses Arbitrum One for bridging USDC.
 *
 * We rely on wagmi's multiInjectedProviderDiscovery (enabled by default)
 * to auto-detect MetaMask, Phantom, Coinbase Wallet, and other browser
 * wallets via EIP-6963. No explicit connectors needed — and importantly,
 * no Coinbase Wallet SDK middleware that validates EIP-712 domain chainId
 * (which would reject Hyperliquid's phantom agent signing with chainId 1337).
 */
export const config = createConfig({
  chains: [arbitrum],
  transports: {
    [arbitrum.id]: http(),
  },
  ssr: true,
});
