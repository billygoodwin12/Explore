// ---------------------------------------------------------------------------
// UI store (Zustand)
// ---------------------------------------------------------------------------

import { create } from 'zustand';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActiveTab = 'chat' | 'portfolio' | 'vault';

export interface UIStore {
  isPortfolioOpen: boolean;
  activeTab: ActiveTab;
  isMobile: boolean;

  togglePortfolio: () => void;
  setActiveTab: (tab: ActiveTab) => void;
  setIsMobile: (isMobile: boolean) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useUIStore = create<UIStore>((set) => ({
  isPortfolioOpen: false,
  activeTab: 'chat',
  isMobile: false,

  togglePortfolio: () =>
    set((state) => ({ isPortfolioOpen: !state.isPortfolioOpen })),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setIsMobile: (isMobile) => set({ isMobile }),
}));
