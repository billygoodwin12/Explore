import { http, createConfig } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { metaMask } from 'wagmi/connectors';

/**
 * MVP: MetaMask only. Auto-discovery disabled so we get exactly one
 * connector (MetaMask) and no other wallet's middleware can interfere
 * with Hyperliquid's EIP-712 signing.
 */
export const config = createConfig({
  chains: [arbitrum],
  connectors: [metaMask()],
  multiInjectedProviderDiscovery: false,
  transports: {
    [arbitrum.id]: http(),
  },
  ssr: true,
});
