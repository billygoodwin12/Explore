'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { parseUnits, formatUnits, erc20Abi } from 'viem';

const ARBITRUM_USDC = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831' as `0x${string}`;
const HYPERLIQUID_BRIDGE = '0x2Df1c51E09aECF9cacB7bc98cB1742757f163dF7' as `0x${string}`;
const MIN_DEPOSIT = 5; // USDC

export function useDeposit() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const [usdcBalance, setUsdcBalance] = useState('0');
  const [depositing, setDepositing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!address || !publicClient) {
      setUsdcBalance('0');
      return;
    }

    try {
      const balance = await publicClient.readContract({
        address: ARBITRUM_USDC,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [address],
      });
      setUsdcBalance(formatUnits(balance, 6));
    } catch {
      setUsdcBalance('0');
    }
  }, [address, publicClient]);

  useEffect(() => {
    refreshBalance();
    const interval = setInterval(refreshBalance, 10000);
    return () => clearInterval(interval);
  }, [refreshBalance]);

  const deposit = useCallback(async (amountUsdc: string) => {
    if (!walletClient || !address) throw new Error('Wallet not connected');

    const amount = parseFloat(amountUsdc);
    if (amount < MIN_DEPOSIT) throw new Error(`Minimum deposit is ${MIN_DEPOSIT} USDC`);
    if (amount > parseFloat(usdcBalance)) throw new Error('Insufficient USDC balance');

    setDepositing(true);
    setError(null);

    try {
      // Simple transfer of USDC to the bridge address
      const hash = await walletClient.writeContract({
        address: ARBITRUM_USDC,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [HYPERLIQUID_BRIDGE, parseUnits(amountUsdc, 6)],
      });

      // Wait for confirmation
      if (publicClient) {
        await publicClient.waitForTransactionReceipt({ hash });
      }

      await refreshBalance();
      return hash;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Deposit failed';
      setError(msg);
      throw e;
    } finally {
      setDepositing(false);
    }
  }, [walletClient, address, usdcBalance, publicClient, refreshBalance]);

  return { usdcBalance, depositing, error, deposit, refreshBalance, minDeposit: MIN_DEPOSIT };
}
