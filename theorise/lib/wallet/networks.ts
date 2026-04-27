import { defineChain, type Address, type Chain } from 'viem';

/**
 * Network switching for Theorise. Set NEXT_PUBLIC_NETWORK=testnet|mainnet
 * in .env.local to flip every chain-aware code path (HyperEVM RPC, HL info
 * endpoint, vault factory, USDC) at once. Default is mainnet so the existing
 * deployment keeps working with no env changes.
 */
export type NetworkName = 'mainnet' | 'testnet';

export const NETWORK: NetworkName =
  (process.env.NEXT_PUBLIC_NETWORK as NetworkName | undefined) === 'testnet'
    ? 'testnet'
    : 'mainnet';

const ZERO: Address = '0x0000000000000000000000000000000000000000';

interface NetworkConfig {
  name: NetworkName;
  /// HyperEVM chain definition for wagmi/viem.
  hyperEvm: Chain;
  /// Block at which the active VaultFactory was deployed. Used to bound
  /// getLogs scans in My Vaults. Bump when redeploying.
  factoryDeployBlock: bigint;
  /// HL info endpoint (REST GET /info).
  hlInfoUrl: string;
  /// HL exchange endpoint (REST POST /exchange).
  hlExchangeUrl: string;
  /// HL websocket endpoint.
  hlWsUrl: string;
  /// Block explorer base URL (for address/tx links).
  explorerBase: string;
  /// USDC ERC20 address on this HyperEVM network.
  usdc: Address;
  /// Active VaultFactory address on this network.
  vaultFactory: Address;
}

const hyperEvmMainnet = defineChain({
  id: 999,
  name: 'HyperEVM',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.hyperliquid.xyz/evm'] } },
  blockExplorers: {
    default: { name: 'HyperEVM Explorer', url: 'https://www.hyperscan.com' },
  },
});

const hyperEvmTestnet = defineChain({
  id: 998,
  name: 'HyperEVM Testnet',
  nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.hyperliquid-testnet.xyz/evm'] } },
  blockExplorers: {
    default: { name: 'HyperEVM Testnet Explorer', url: 'https://hyperevmscan.io' },
  },
  testnet: true,
});

const MAINNET: NetworkConfig = {
  name: 'mainnet',
  hyperEvm: hyperEvmMainnet,
  factoryDeployBlock: BigInt(32_900_000),
  hlInfoUrl: 'https://api.hyperliquid.xyz/info',
  hlExchangeUrl: 'https://api.hyperliquid.xyz/exchange',
  hlWsUrl: 'wss://api.hyperliquid.xyz/ws',
  explorerBase: 'https://hyperscan.com',
  usdc: '0xb88339CB7199b77E23DB6E890353E22632Ba630f',
  vaultFactory:
    (process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS_MAINNET as Address | undefined) ??
    (process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS as Address | undefined) ??
    ZERO,
};

const TESTNET: NetworkConfig = {
  name: 'testnet',
  hyperEvm: hyperEvmTestnet,
  factoryDeployBlock:
    process.env.NEXT_PUBLIC_VAULT_FACTORY_DEPLOY_BLOCK_TESTNET
      ? BigInt(process.env.NEXT_PUBLIC_VAULT_FACTORY_DEPLOY_BLOCK_TESTNET)
      : BigInt(0),
  hlInfoUrl: 'https://api.hyperliquid-testnet.xyz/info',
  hlExchangeUrl: 'https://api.hyperliquid-testnet.xyz/exchange',
  hlWsUrl: 'wss://api.hyperliquid-testnet.xyz/ws',
  explorerBase: 'https://hyperevmscan.io',
  // Testnet has no canonical USDC. Set a community-deployed address or our
  // own mock USDC via NEXT_PUBLIC_USDC_ADDRESS_TESTNET.
  usdc:
    (process.env.NEXT_PUBLIC_USDC_ADDRESS_TESTNET as Address | undefined) ?? ZERO,
  vaultFactory:
    (process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS_TESTNET as Address | undefined) ??
    ZERO,
};

export const NETWORK_CONFIG: NetworkConfig = NETWORK === 'testnet' ? TESTNET : MAINNET;

/// Convenience re-exports — most call sites only need a couple of these.
export const hyperEvm = NETWORK_CONFIG.hyperEvm;
export const HL_INFO_URL = NETWORK_CONFIG.hlInfoUrl;
export const HL_EXCHANGE_URL = NETWORK_CONFIG.hlExchangeUrl;
export const HL_WS_URL = NETWORK_CONFIG.hlWsUrl;
export const EXPLORER_BASE = NETWORK_CONFIG.explorerBase;
export const HYPEREVM_USDC: Address = NETWORK_CONFIG.usdc;
export const VAULT_FACTORY_ADDRESS: Address = NETWORK_CONFIG.vaultFactory;
export const FACTORY_DEPLOY_BLOCK: bigint = NETWORK_CONFIG.factoryDeployBlock;

export function isFactoryConfigured(): boolean {
  return VAULT_FACTORY_ADDRESS !== ZERO;
}

export function isUsdcConfigured(): boolean {
  return HYPEREVM_USDC !== ZERO;
}
