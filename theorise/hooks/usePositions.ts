'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { getClearinghouseState, getSpotClearinghouseState, type Position } from '@/lib/hyperliquid/exchange';

export function usePositions() {
  const { address } = useAccount();
  const [positions, setPositions] = useState<Position[]>([]);
  const [accountValue, setAccountValue] = useState('0');
  const [withdrawable, setWithdrawable] = useState('0');
  const [marginUsed, setMarginUsed] = useState('0');
  const [spotUsdcTotal, setSpotUsdcTotal] = useState('0');
  const [spotUsdcAvailable, setSpotUsdcAvailable] = useState('0');
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!address) {
      setPositions([]);
      setAccountValue('0');
      setWithdrawable('0');
      setMarginUsed('0');
      setSpotUsdcTotal('0');
      setSpotUsdcAvailable('0');
      return;
    }

    try {
      setLoading(true);
      const [perpsState, spotState] = await Promise.all([
        getClearinghouseState(address),
        getSpotClearinghouseState(address),
      ]);

      // Perps
      const open = perpsState.assetPositions
        .map(ap => ap.position)
        .filter(p => parseFloat(p.szi) !== 0);
      setPositions(open);
      setAccountValue(perpsState.marginSummary.accountValue);
      setWithdrawable(perpsState.withdrawable);
      setMarginUsed(perpsState.marginSummary.totalMarginUsed);

      // Spot USDC balance
      const usdcBal = spotState.balances?.find(b => b.coin === 'USDC');
      if (usdcBal) {
        setSpotUsdcTotal(usdcBal.total);
        const available = parseFloat(usdcBal.total) - parseFloat(usdcBal.hold);
        setSpotUsdcAvailable(available.toString());
      } else {
        setSpotUsdcTotal('0');
        setSpotUsdcAvailable('0');
      }
    } catch {
      // silently fail, will retry
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 3000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  return { positions, accountValue, withdrawable, marginUsed, spotUsdcTotal, spotUsdcAvailable, loading, refresh };
}
