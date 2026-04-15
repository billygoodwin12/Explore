'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAccount } from 'wagmi';
import {
  getClearinghouseState,
  getSpotClearinghouseState,
  getPerpDexs,
  type Position,
  type PerpDex,
} from '@/lib/hyperliquid/exchange';

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
      const perpDexsRaw = await getPerpDexs().catch(() => [] as (PerpDex | null)[]);
      const hip3Dexs: PerpDex[] = [];
      for (const d of perpDexsRaw) {
        if (d) hip3Dexs.push(d);
      }

      const [perpsState, spotState, ...hip3States] = await Promise.all([
        getClearinghouseState(address),
        getSpotClearinghouseState(address),
        ...hip3Dexs.map(d =>
          getClearinghouseState(address, d.name)
            .then(s => ({ dex: d.name, state: s }))
            .catch(() => null),
        ),
      ]);

      // Default-dex perps
      const open: Position[] = perpsState.assetPositions
        .map(ap => ap.position)
        .filter(p => parseFloat(p.szi) !== 0);

      // HIP-3 perps — normalize coin to "dex:local" form if not already prefixed
      for (const r of hip3States) {
        if (!r) continue;
        const { dex, state } = r as { dex: string; state: typeof perpsState };
        for (const ap of state.assetPositions) {
          const p = ap.position;
          if (parseFloat(p.szi) === 0) continue;
          const coin = p.coin.includes(':') ? p.coin : `${dex}:${p.coin}`;
          open.push({ ...p, coin });
        }
      }

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
