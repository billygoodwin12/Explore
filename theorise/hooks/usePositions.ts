'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import { getClearinghouseState, type Position, type ClearinghouseState } from '@/lib/hyperliquid/exchange';

export function usePositions() {
  const { address } = useAccount();
  const [positions, setPositions] = useState<Position[]>([]);
  const [accountValue, setAccountValue] = useState('0');
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    if (!address) {
      setPositions([]);
      setAccountValue('0');
      return;
    }

    try {
      setLoading(true);
      const state = await getClearinghouseState(address);
      const open = state.assetPositions
        .map(ap => ap.position)
        .filter(p => parseFloat(p.szi) !== 0);
      setPositions(open);
      setAccountValue(state.marginSummary.accountValue);
    } catch {
      // silently fail, will retry
    } finally {
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    refresh();
    intervalRef.current = setInterval(refresh, 5000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refresh]);

  return { positions, accountValue, loading, refresh };
}
