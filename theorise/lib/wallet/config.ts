import { http, createConfig } from 'wagmi';
import { arbitrum } from 'wagmi/chains';
import { metaMask } from 'wagmi/connectors';
import { defineChain } from 'viem';

/// HyperEVM mainnet — chain id 999, HYPE native gas.
export const hyperEvm = defineChain({
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.hyperliquid.xyz/evm'] },
  },
  blockExplorers: {
    default: { name: 'HyperEVM Explorer', url: 'https://www.hyperscan.com' },
  },
});

/**
 * MVP: MetaMask only. Auto-discovery disabled so we get exactly one
 * connector (MetaMask) and no other wallet's middleware can interfere
 * with Hyperliquid's EIP-712 signing.
 *
 * Arbitrum stays for the USDC-deposit flow to Hyperliquid's L1 bridge.
 * HyperEVM is needed for the vault factory + vault contracts.
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
