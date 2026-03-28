'use client';

// ---------------------------------------------------------------------------
// usePortfolio – combines portfolio store with data fetching
// ---------------------------------------------------------------------------

import { useEffect } from 'react';
import { usePortfolioStore } from '@/stores/portfolio-store';

export function usePortfolio() {
  const positions = usePortfolioStore((s) => s.positions);
  const totalValue = usePortfolioStore((s) => s.totalValue);
  const totalPnl = usePortfolioStore((s) => s.totalPnl);
  const isLoading = usePortfolioStore((s) => s.isLoading);
  const setPositions = usePortfolioStore((s) => s.setPositions);
  const setTotalValue = usePortfolioStore((s) => s.setTotalValue);
  const setLoading = usePortfolioStore((s) => s.setLoading);

  useEffect(() => {
    // Only fetch if a wallet is conceptually connected (positions empty as proxy)
    const walletConnected = true; // Stub: replace with real wallet check

    if (!walletConnected) return;

    let cancelled = false;

    async function fetchPortfolio() {
      setLoading(true);
      try {
        const res = await fetch('/api/portfolio/state');
        if (!res.ok) throw new Error(`Portfolio fetch failed: ${res.status}`);

        const data = await res.json();
        if (cancelled) return;

        setPositions(data.positions ?? []);
        setTotalValue(data.totalValue ?? 0);
      } catch (err) {
        console.error('[usePortfolio] fetch error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPortfolio();

    return () => {
      cancelled = true;
    };
  }, [setPositions, setTotalValue, setLoading]);

  return { positions, totalValue, totalPnl, isLoading };
}
