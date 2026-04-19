import { create } from 'zustand';

export type Dir = 'long' | 'short';
export type Lev = 1 | 2 | 3 | 5 | 10 | 20;
export type Timeframe = '1h' | '4h' | '1d' | '3d' | '7d' | '2w' | '1m' | '3m';
export type SettlementMode = 'HARD' | 'SOFT' | 'CREATOR';

export interface VaultPosition {
  sym: string;
  name: string;
  dir: Dir;
  lev: Lev;
  alloc: number;
}

export interface VaultCreateState {
  step: 1 | 2 | 3 | 4;
  name: string;
  desc: string;
  /** Total collateral (initial margin) the creator deposits, in USDC. */
  deployIM: number;
  timeframe: Timeframe;
  settlementMode: SettlementMode;
  perfFee: number;
  exitFee: number;
  minDeposit: number;
  positions: VaultPosition[];
  vaultAddress: string | null;

  setStep: (step: 1 | 2 | 3 | 4) => void;
  setName: (name: string) => void;
  setDesc: (desc: string) => void;
  setDeployIM: (im: number) => void;
  setTimeframe: (tf: Timeframe) => void;
  setSettlementMode: (mode: SettlementMode) => void;
  setPerfFee: (fee: number) => void;
  setExitFee: (fee: number) => void;
  setMinDeposit: (min: number) => void;
  setPositions: (positions: VaultPosition[]) => void;
  setVaultAddress: (addr: string) => void;
  reset: () => void;
}

const INITIAL: Pick<VaultCreateState,
  'step' | 'name' | 'desc' | 'deployIM' | 'timeframe' | 'settlementMode' |
  'perfFee' | 'exitFee' | 'minDeposit' | 'positions' | 'vaultAddress'
> = {
  step: 1,
  name: '',
  desc: '',
  deployIM: 100,
  timeframe: '7d',
  settlementMode: 'HARD',
  perfFee: 15,
  exitFee: 1,
  minDeposit: 25,
  positions: [],
  vaultAddress: null,
};

export const useVaultCreateStore = create<VaultCreateState>((set) => ({
  ...INITIAL,
  setStep: (step) => set({ step }),
  setName: (name) => set({ name }),
  setDesc: (desc) => set({ desc }),
  setDeployIM: (deployIM) => set({ deployIM }),
  setTimeframe: (timeframe) => set({ timeframe }),
  setSettlementMode: (settlementMode) => set({ settlementMode }),
  setPerfFee: (perfFee) => set({ perfFee }),
  setExitFee: (exitFee) => set({ exitFee }),
  setMinDeposit: (minDeposit) => set({ minDeposit }),
  setPositions: (positions) => set({ positions }),
  setVaultAddress: (vaultAddress) => set({ vaultAddress }),
  reset: () => set(INITIAL),
}));

const MIN_ORDER = 10;

/** Per-position IM = totalIM × alloc/100. */
export function posIM(im: number, alloc: number): number {
  return im * (alloc / 100);
}

/** Per-position notional = posIM × leverage. */
export function posNotional(im: number, alloc: number, lev: number): number {
  return posIM(im, alloc) * lev;
}

/**
 * Smallest collateral (IM) such that every position's notional clears
 * Hyperliquid's $10 minimum order: notional_i = IM × alloc/100 × lev ≥ 10
 *   → IM ≥ 1000 / (alloc × lev). Take the max across positions.
 */
export function calcMinIM(positions: VaultPosition[]): number {
  if (!positions.length) return MIN_ORDER;
  return Math.ceil(Math.max(...positions.map(p => 1000 / (p.alloc * p.lev))));
}

/** Total notional = sum of per-position notionals. */
export function calcTotalNotional(positions: VaultPosition[], im: number): number {
  return positions.reduce((acc, p) => acc + posNotional(im, p.alloc, p.lev), 0);
}

export function totalAlloc(positions: VaultPosition[]): number {
  return positions.reduce((a, p) => a + p.alloc, 0);
}

export function rebalanceAlloc(positions: VaultPosition[], idx: number, newVal: number): VaultPosition[] {
  const next = positions.map(p => ({ ...p }));
  const diff = newVal - next[idx].alloc;
  next[idx].alloc = newVal;

  const otherIdxs = next.map((_, i) => i).filter(i => i !== idx);
  const otherTotal = otherIdxs.reduce((a, i) => a + next[i].alloc, 0);

  if (otherTotal === 0) {
    const each = Math.round((100 - newVal) / otherIdxs.length);
    otherIdxs.forEach(i => { next[i].alloc = each; });
  } else {
    otherIdxs.forEach(i => {
      next[i].alloc = Math.max(5, Math.round(next[i].alloc - diff * (next[i].alloc / otherTotal)));
    });
  }

  const sum = totalAlloc(next);
  if (sum !== 100 && otherIdxs.length) {
    next[otherIdxs[otherIdxs.length - 1]].alloc += 100 - sum;
  }
  return next;
}

export function evenAlloc(n: number): number[] {
  const each = Math.floor(100 / n);
  return Array.from({ length: n }, (_, i) => (i === 0 ? 100 - each * (n - 1) : each));
}
