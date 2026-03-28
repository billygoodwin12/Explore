// ---------------------------------------------------------------------------
// Portfolio store (Zustand)
// ---------------------------------------------------------------------------

import { create } from 'zustand';
import type { Position } from '../lib/venues/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortfolioStore {
  positions: Position[];
  totalValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  isLoading: boolean;

  setPositions: (positions: Position[]) => void;
  updatePosition: (symbol: string, updates: Partial<Position>) => void;
  setTotalValue: (value: number) => void;
  setLoading: (loading: boolean) => void;
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

function computeTotals(positions: Position[]) {
  const totalPnl = positions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  const totalCost = positions.reduce((sum, p) => sum + p.entryPrice * p.size, 0);
  const totalPnlPercent = totalCost === 0 ? 0 : (totalPnl / totalCost) * 100;
  return { totalPnl, totalPnlPercent };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const usePortfolioStore = create<PortfolioStore>((set) => ({
  positions: [],
  totalValue: 0,
  totalPnl: 0,
  totalPnlPercent: 0,
  isLoading: false,

  setPositions: (positions) => {
    const { totalPnl, totalPnlPercent } = computeTotals(positions);
    set({ positions, totalPnl, totalPnlPercent });
  },

  updatePosition: (symbol, updates) =>
    set((state) => {
      const positions = state.positions.map((p) =>
        p.symbol === symbol ? { ...p, ...updates } : p,
      );
      const { totalPnl, totalPnlPercent } = computeTotals(positions);
      return { positions, totalPnl, totalPnlPercent };
    }),

  setTotalValue: (totalValue) => set({ totalValue }),

  setLoading: (loading) => set({ isLoading: loading }),
}));
