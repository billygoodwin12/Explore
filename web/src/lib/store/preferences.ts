"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type StatCardId = "available" | "invested" | "pnl30d";

type PreferencesState = {
  maskedStatCards: Record<StatCardId, boolean>;
  hiddenHoldings: string[];
  toggleStatMask: (id: StatCardId) => void;
  hideHolding: (creatorId: string) => void;
  unhideHolding: (creatorId: string) => void;
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      maskedStatCards: { available: false, invested: false, pnl30d: false },
      hiddenHoldings: [],
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
    }),
    {
      name: "theorise:preferences",
      version: 1,
    },
  ),
);
