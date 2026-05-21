"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StatCardId = "available" | "invested" | "pnl30d";
export type PnlUnit = "percent" | "dollars" | "hidden";

type PreferencesState = {
  /* Stat-card masking (Step 10) */
  maskedStatCards: Record<StatCardId, boolean>;
  hiddenHoldings: string[];

  /* Display (Step 12) */
  pnlUnit: PnlUnit;
  showCostBasis: boolean;
  showLivePnlChipsInNav: boolean;

  /* Notifications (Phase 2 — preferences only) */
  notifyDepositConfirmations: boolean;
  notifyWithdrawConfirmations: boolean;
  notifyCreatorTrades: boolean;

  /* Trading guardrails */
  dailyLossCircuitBreakerEnabled: boolean;
  dailyLossCircuitBreakerPct: number;

  /* Actions */
  toggleStatMask: (id: StatCardId) => void;
  hideHolding: (creatorId: string) => void;
  unhideHolding: (creatorId: string) => void;

  setPnlUnit: (v: PnlUnit) => void;
  setShowCostBasis: (v: boolean) => void;
  setShowLivePnlChipsInNav: (v: boolean) => void;

  setNotifyDepositConfirmations: (v: boolean) => void;
  setNotifyWithdrawConfirmations: (v: boolean) => void;
  setNotifyCreatorTrades: (v: boolean) => void;

  setDailyLossCircuitBreakerEnabled: (v: boolean) => void;
  setDailyLossCircuitBreakerPct: (v: number) => void;
};

const DEFAULTS = {
  maskedStatCards: { available: false, invested: false, pnl30d: false },
  hiddenHoldings: [],
  pnlUnit: "percent" as PnlUnit,
  showCostBasis: false,
  showLivePnlChipsInNav: true,
  notifyDepositConfirmations: true,
  notifyWithdrawConfirmations: true,
  notifyCreatorTrades: false,
  dailyLossCircuitBreakerEnabled: false,
  dailyLossCircuitBreakerPct: 10,
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      toggleStatMask: (id) =>
        set((s) => ({
          maskedStatCards: {
            ...s.maskedStatCards,
            [id]: !s.maskedStatCards[id],
          },
        })),
      hideHolding: (creatorId) =>
        set((s) =>
          s.hiddenHoldings.includes(creatorId)
            ? s
            : { hiddenHoldings: [...s.hiddenHoldings, creatorId] },
        ),
      unhideHolding: (creatorId) =>
        set((s) => ({
          hiddenHoldings: s.hiddenHoldings.filter((id) => id !== creatorId),
        })),

      setPnlUnit: (pnlUnit) => set({ pnlUnit }),
      setShowCostBasis: (showCostBasis) => set({ showCostBasis }),
      setShowLivePnlChipsInNav: (showLivePnlChipsInNav) =>
        set({ showLivePnlChipsInNav }),

      setNotifyDepositConfirmations: (notifyDepositConfirmations) =>
        set({ notifyDepositConfirmations }),
      setNotifyWithdrawConfirmations: (notifyWithdrawConfirmations) =>
        set({ notifyWithdrawConfirmations }),
      setNotifyCreatorTrades: (notifyCreatorTrades) =>
        set({ notifyCreatorTrades }),

      setDailyLossCircuitBreakerEnabled: (dailyLossCircuitBreakerEnabled) =>
        set({ dailyLossCircuitBreakerEnabled }),
      setDailyLossCircuitBreakerPct: (pct) =>
        set({ dailyLossCircuitBreakerPct: Math.max(1, Math.min(100, pct)) }),
    }),
    {
      name: "theorise:preferences",
      version: 2,
      merge: (persisted, current) => ({
        ...current,
        ...(persisted as Partial<PreferencesState>),
      }),
    },
  ),
);
