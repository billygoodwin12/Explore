'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient } from 'wagmi';
import { erc20Abi, formatUnits } from 'viem';
import { HYPEREVM_USDC, hyperEvm } from '@/lib/wallet/networks';

/**
 * Reads the connected wallet's HyperEVM USDC balance. The legacy
 * Arbitrum→HL bridge flow this hook used to drive is intentionally removed
 * — see DECISIONS.md ("In-app bridge UI — DEFERRED to v0.x"). Until the
 * in-app bridge ships, users can move USDC between EVM and Core via the
 * HL bridge UI directly.
 */
export function useDeposit() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const [usdcBalance, setUsdcBalance] = useState('0');

  const isWrongChain = !!address && chainId !== hyperEvm.id;

  const refreshBalance = useCallback(async () => {
    if (!address || !publicClient || isWrongChain) {
      setUsdcBalance('0');
      return;
    }
    try {
      const balance = await publicClient.readContract({
        address: HYPEREVM_USDC,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      });
      setUsdcBalance(formatUnits(balance, 6));
    } catch {
      setUsdcBalance('0');
    }
  }, [address, publicClient, isWrongChain]);

  useEffect(() => {
    refreshBalance();
    const interval = setInterval(refreshBalance, 10_000);
    return () => clearInterval(interval);
  }, [refreshBalance]);

  return {
    usdcBalance,
    refreshBalance,
    isWrongChain,
  };
}
