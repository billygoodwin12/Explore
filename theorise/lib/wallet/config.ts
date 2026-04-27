import { http, createConfig } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { metaMask } from 'wagmi/connectors';
import { hyperEvm } from './networks';

// Re-export for any callers still importing hyperEvm from here.
export { hyperEvm } from './networks';

/**
 * MVP: MetaMask only. Auto-discovery disabled so we get exactly one
 * connector (MetaMask) and no other wallet's middleware can interfere
 * with Hyperliquid's EIP-712 signing.
 *
 * Arbitrum stays for the USDC-deposit flow to Hyperliquid's L1 bridge.
 * HyperEVM (mainnet 999 / testnet 998) is selected via NEXT_PUBLIC_NETWORK
 * — see lib/wallet/networks.ts.
 */
export const config = createConfig({
  chains: [arbitrum, hyperEvm],
  connectors: [metaMask()],
  multiInjectedProviderDiscovery: false,
  transports: {
    [arbitrum.id]: http(),
    [hyperEvm.id]: http(),
  },
  ssr: true,
});
