import { create } from 'zustand';

export type ActiveTab = 'trade' | 'vaults' | 'social';

export interface UIStore {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  activeTab: 'trade',
  setActiveTab: (tab) => set({ activeTab: tab }),
}));
