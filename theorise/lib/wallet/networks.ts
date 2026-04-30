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
  /// HL portfolio page — opened in a new tab when the user clicks
  /// "Bridge to EVM". The portfolio page hosts HL's deposit/withdraw UI
  /// for moving USDC between Core and EVM, until our in-app bridge ships.
  bridgeUrl: string;
  /// Native USDC ERC20 address on this HyperEVM network. This is the token
  /// users hold and the contract calls `balanceOf` / `transfer` on. Distinct
  /// from `coreDepositWallet` (the bridge proxy).
  usdc: Address;
  /// Circle's CoreDepositWallet — the bridge proxy used to move native USDC
  /// from EVM to Core. Bridge with `IERC20.approve(coreDepositWallet, x)`
  /// then `coreDepositWallet.deposit(x)`. NOT an ERC-20; do not call
  /// `balanceOf` / `transfer` on this. This is the address HL's `spotMeta`
  /// returns under `evmContract.address` (a misleading field name).
  coreDepositWallet: Address;
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
  bridgeUrl: 'https://app.hyperliquid.xyz/portfolio',
  usdc: '0xb88339CB7199b77E23DB6E890353E22632Ba630f',
  coreDepositWallet: '0x6b9e773128f453F5C2c60935ee2De2cBC5390a24',
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
  bridgeUrl: 'https://app.hyperliquid-testnet.xyz/portfolio',
  // Native Circle USDC ERC-20 on HyperEVM testnet. Verified via Phase 0
  // investigation: this is the token where balances actually live. Distinct
  // from the CoreDepositWallet bridge below (which spotMeta misleadingly
  // returns as `evmContract.address`).
  usdc:
    (process.env.NEXT_PUBLIC_USDC_ADDRESS_TESTNET as Address | undefined) ??
    '0x2B3370eE501B4a559b57D449569354196457D8Ab',
  coreDepositWallet: '0x0b80659a4076E9E93c7dbe0F10675A16A3e5C206',
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
export const BRIDGE_URL = NETWORK_CONFIG.bridgeUrl;
export const HYPEREVM_USDC: Address = NETWORK_CONFIG.usdc;
export const CORE_DEPOSIT_WALLET: Address = NETWORK_CONFIG.coreDepositWallet;
export const VAULT_FACTORY_ADDRESS: Address = NETWORK_CONFIG.vaultFactory;
export const FACTORY_DEPLOY_BLOCK: bigint = NETWORK_CONFIG.factoryDeployBlock;

export function isFactoryConfigured(): boolean {
  return VAULT_FACTORY_ADDRESS !== ZERO;
}

export function isUsdcConfigured(): boolean {
  return HYPEREVM_USDC !== ZERO;
}
