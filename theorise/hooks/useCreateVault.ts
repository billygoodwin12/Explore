'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient, useSwitchChain } from 'wagmi';
import { decodeEventLog, parseUnits, type Address } from 'viem';
import { hyperEvm } from '@/lib/wallet/config';
import {
  VAULT_FACTORY_ADDRESS,
  HYPEREVM_USDC,
  erc20Abi,
  vaultFactoryAbi,
  isFactoryConfigured,
  type ContractPosition,
} from '@/lib/contracts/vault-factory';
import {
  calcMinIM,
  type Timeframe,
  type VaultPosition,
} from '@/stores/vault-create-store';
import { useMarketData } from '@/hooks/useMarketData';

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1h': 60 * 60,
  '4h': 4 * 60 * 60,
  '1d': 24 * 60 * 60,
  '3d': 3 * 24 * 60 * 60,
  '7d': 7 * 24 * 60 * 60,
  '2w': 14 * 24 * 60 * 60,
  '1m': 30 * 24 * 60 * 60,
  '3m': 90 * 24 * 60 * 60,
};

export interface CreateVaultInput {
  positions: VaultPosition[];
  deployIM: number;        // creator collateral (initial margin) in USDC, human units
  timeframe: Timeframe;
  perfFeePct: number;      // 0..30, wizard slider value
}

export interface CreateVaultResult {
  vaultAddress: Address;
  txHash: `0x${string}`;
}

export function useCreateVault() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: hyperEvm.id });
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();
  const { markets, loading: marketsLoading } = useMarketData();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deploymentFee, setDeploymentFee] = useState<bigint | null>(null);

  // Pull the factory's immutable deployment fee once so the UI can show the
  // creator exactly what they'll be charged on top of their IM.
  useEffect(() => {
    if (!publicClient || !isFactoryConfigured()) return;
    let cancelled = false;
    publicClient
      .readContract({
        address: VAULT_FACTORY_ADDRESS,
        abi: vaultFactoryAbi,
        functionName: 'deploymentFee',
      })
      .then((fee) => {
        if (!cancelled) setDeploymentFee(fee as bigint);
      })
      .catch(() => {
        if (!cancelled) setDeploymentFee(null);
      });
    return () => { cancelled = true; };
  }, [publicClient]);

  const create = useCallback(async (input: CreateVaultInput): Promise<CreateVaultResult> => {
    setError(null);

    if (!address) throw new Error('Connect your wallet first.');
    if (!isFactoryConfigured()) {
      throw new Error('Vault factory not deployed yet. Set NEXT_PUBLIC_VAULT_FACTORY_ADDRESS once the factory is live on HyperEVM.');
    }
    if (marketsLoading || markets.length === 0) {
      throw new Error('Market data still loading — try again in a moment.');
    }
    if (input.positions.length === 0) throw new Error('Add at least one position.');

    const allocSum = input.positions.reduce((a, p) => a + p.alloc, 0);
    if (allocSum !== 100) throw new Error(`Allocation must sum to 100%, got ${allocSum}%`);

    // Wizard slider is 0..30 (percent). Contract wants bps (0..3000), capped on-chain.
    if (input.perfFeePct < 0 || input.perfFeePct > 30) {
      throw new Error('Performance fee must be 0–30%.');
    }
    const perfFeeBps = Math.round(input.perfFeePct * 100);

    setCreating(true);
    try {
      // 1. Chain switch to HyperEVM
      if (chainId !== hyperEvm.id) {
        try {
          await switchChainAsync({ chainId: hyperEvm.id });
        } catch {
          throw new Error('Please switch your wallet to HyperEVM (chain 999).');
        }
      }
      if (!walletClient) throw new Error('Switch to HyperEVM and try again.');
      if (!publicClient) throw new Error('HyperEVM RPC unavailable.');

      // 2. Resolve on-chain position tuple from market metadata
      const contractPositions: ContractPosition[] = input.positions.map((p) => {
        const market = markets.find((m) => m.sym === p.sym);
        if (!market) throw new Error(`Asset ${p.sym} not found in Hyperliquid universe.`);
        if (market.dex) throw new Error(`HIP-3 assets (${p.sym}) are not supported in vaults yet.`);
        return {
          asset: market.assetIndex,
          isBuy: p.dir === 'long',
          allocBps: p.alloc * 100,
          lev: p.lev,
          szDecimals: market.szDecimals,
        };
      });

      // 3. Expiry + creator IM. The wizard already expresses deployment as
      //    collateral (IM), so just clamp to the min implied by the position
      //    mix and pass it straight through.
      const expiryTs = BigInt(Math.floor(Date.now() / 1000) + TIMEFRAME_SECONDS[input.timeframe]);
      const creatorImUsdc = Math.max(input.deployIM, calcMinIM(input.positions));
      // round to 6dp for parseUnits; USDC has 6 decimals on HyperEVM
      const creatorIM = parseUnits(creatorImUsdc.toFixed(6), 6);

      // 4. Read current deployment fee straight from the contract (source of
      //    truth — the cached value in state could be stale on first load).
      const fee = await publicClient.readContract({
        address: VAULT_FACTORY_ADDRESS,
        abi: vaultFactoryAbi,
        functionName: 'deploymentFee',
      }) as bigint;
      const totalNeeded = creatorIM + fee;

      // Ensure USDC allowance covers IM + fee.
      const allowance = await publicClient.readContract({
        address: HYPEREVM_USDC,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [address, VAULT_FACTORY_ADDRESS],
      }) as bigint;

      if (allowance < totalNeeded) {
        const approveHash = await walletClient.writeContract({
          address: HYPEREVM_USDC,
          abi: erc20Abi,
          functionName: 'approve',
          args: [VAULT_FACTORY_ADDRESS, totalNeeded],
          chain: hyperEvm,
          account: address,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // 5. createVault
      const txHash = await walletClient.writeContract({
        address: VAULT_FACTORY_ADDRESS,
        abi: vaultFactoryAbi,
        functionName: 'createVault',
        args: [contractPositions, expiryTs, creatorIM, perfFeeBps],
        chain: hyperEvm,
        account: address,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      // 6. Parse VaultCreated log emitted by the factory
      let vaultAddress: Address | null = null;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== VAULT_FACTORY_ADDRESS.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi: vaultFactoryAbi,
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'VaultCreated') {
            vaultAddress = (decoded.args as { vault: Address }).vault;
            break;
          }
        } catch {
          // not our event, keep looking
        }
      }
      if (!vaultAddress) throw new Error('VaultCreated event not found in receipt.');

      return { vaultAddress, txHash };
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Deploy failed';
      setError(msg);
      throw e;
    } finally {
      setCreating(false);
    }
  }, [address, chainId, publicClient, walletClient, switchChainAsync, markets, marketsLoading]);

  return {
    create,
    creating,
    error,
    factoryReady: isFactoryConfigured(),
    /// Deployment fee in USDC 6dp, or null until it's been read from chain.
    deploymentFee,
  };
}
