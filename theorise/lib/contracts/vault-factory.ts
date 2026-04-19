import type { Abi, Address } from 'viem';

/**
 * Address of the deployed VaultFactory on HyperEVM mainnet.
 * Must be set in env as NEXT_PUBLIC_VAULT_FACTORY_ADDRESS once the factory
 * is deployed. Until then, the wizard deploy button throws a clear error.
 */
export const VAULT_FACTORY_ADDRESS =
  (process.env.NEXT_PUBLIC_VAULT_FACTORY_ADDRESS as Address | undefined) ??
  ('0x0000000000000000000000000000000000000000' as Address);

/// HyperEVM USDC ERC20 (mainnet).
export const HYPEREVM_USDC: Address = '0xb88339CB7199b77E23DB6E890353E22632Ba630f';

/// Minimal ERC20 ABI — just the entrypoints we call for approvals + balance.
export const erc20Abi = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'who', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const satisfies Abi;

/// Minimal VaultFactory ABI — createVault + deploymentFee view + VaultCreated.
/// Matches contracts/src/VaultFactory.sol.
export const vaultFactoryAbi = [
  {
    name: 'createVault',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'positions',
        type: 'tuple[]',
        components: [
          { name: 'asset', type: 'uint32' },
          { name: 'isBuy', type: 'bool' },
          { name: 'allocBps', type: 'uint16' },
          { name: 'lev', type: 'uint8' },
          { name: 'szDecimals', type: 'uint8' },
        ],
      },
      { name: 'expiryTs', type: 'uint64' },
      { name: 'creatorIM', type: 'uint256' },
    ],
    outputs: [{ name: 'vault', type: 'address' }],
  },
  {
    name: 'deploymentFee',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    name: 'VaultCreated',
    type: 'event',
    anonymous: false,
    inputs: [
      { name: 'vault', type: 'address', indexed: true },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'expiryTs', type: 'uint64', indexed: false },
      { name: 'creatorIM', type: 'uint256', indexed: false },
      { name: 'deploymentFee', type: 'uint256', indexed: false },
    ],
  },
] as const satisfies Abi;

/// On-chain Position struct that matches contracts/src/Vault.sol:Position.
export interface ContractPosition {
  asset: number;      // uint32
  isBuy: boolean;
  allocBps: number;   // uint16: percent * 100
  lev: number;        // uint8
  szDecimals: number; // uint8
}

/// True when the env-configured factory address is set to a non-zero value.
export function isFactoryConfigured(): boolean {
  return VAULT_FACTORY_ADDRESS !== '0x0000000000000000000000000000000000000000';
}
