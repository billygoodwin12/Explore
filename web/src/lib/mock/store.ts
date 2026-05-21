import { buildMockCreators } from "@/lib/seed/mockCreators";
import type {
  Hex,
  MockCreator,
  MockPosition,
  MockUserShare,
} from "@/lib/mock/types";

type Listener = () => void;

const TICK_MS = 5_000;

class MockStore {
  private creators = new Map<Hex, MockCreator>();
  private order: Hex[] = [];
  private follows = new Set<Hex>();
  private userShares = new Map<Hex, MockUserShare>();
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private hasUserShares = false;
  private version = 0;

  getVersion = (): number => this.version;
  getServerVersion = (): number => 0;

  constructor() {
    const initial = buildMockCreators();
    for (const c of initial) {
      this.creators.set(c.id, c);
      this.order.push(c.id);
    }
    this.follows.add(initial[0]!.id);
    this.follows.add(initial[7]!.id);
    this.follows.add(initial[10]!.id);
  }

  private startIfNeeded() {
    if (this.timer || typeof window === "undefined") return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  private stopIfIdle() {
    if (this.listeners.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    this.startIfNeeded();
    return () => {
      this.listeners.delete(listener);
      this.stopIfIdle();
    };
  };

  private emit() {
    this.version++;
    for (const l of this.listeners) l();
  }

  private tick() {
    for (const id of this.order) {
      const c = this.creators.get(id);
      if (!c) continue;
      const drift = (Math.random() - 0.5) * 0.003;
      const nav = Math.max(c.nav * (1 + drift), 1);
      const pricePerShare = c.shareSupply > 0 ? nav / c.shareSupply : 1;
      const openPositions: MockPosition[] = c.openPositions.map((p) => {
        const pd = (Math.random() - 0.5) * 0.0035;
        const markPrice = Math.max(p.markPrice * (1 + pd), 0.0001);
        return { ...p, markPrice };
      });
      const next: MockCreator = {
        ...c,
        nav,
        tvl: nav,
        pricePerShare,
        navHistory: [...c.navHistory.slice(1), nav],
        openPositions,
      };
      this.creators.set(id, next);
    }
    this.emit();
  }

  setDepositFee = (id: Hex, bps: number) => {
    const c = this.creators.get(id);
    if (!c) return;
    this.creators.set(id, { ...c, depositFeeBps: Math.max(0, Math.min(100, bps)) });
    this.emit();
  };

  setPerformanceFee = (id: Hex, bps: number) => {
    const c = this.creators.get(id);
    if (!c) return;
    this.creators.set(id, { ...c, perfFeeBps: Math.max(0, Math.min(2000, bps)) });
    this.emit();
  };

  getUserUsdcBalance = (userAddress: Hex | undefined): number => {
    if (!userAddress) return 0;
    const seed = parseInt(userAddress.slice(2, 10), 16);
    return 800 + (seed % 1600) + ((seed >> 8) % 100) / 100;
  };

  getUserHyperliquidBalances = (
    userAddress: Hex | undefined,
  ): { spot: number; perp: number; totalAvailable: number } => {
    if (!userAddress) return { spot: 0, perp: 0, totalAvailable: 0 };
    const seed = parseInt(userAddress.slice(2, 10), 16);
    const spot = 150 + (seed % 320) + ((seed >> 4) % 100) / 100;
    const perp = 200 + ((seed >> 8) % 480) + ((seed >> 12) % 100) / 100;
    return { spot, perp, totalAvailable: spot + perp };
  };

  getCreator = (id: Hex): MockCreator | undefined => {
    return this.creators.get(id);
  };

  getCreatorByHandle = (handle: string): MockCreator | undefined => {
    for (const id of this.order) {
      const c = this.creators.get(id);
      if (c && c.handle === handle) return c;
    }
    return undefined;
  };

  getAllCreators = (): MockCreator[] => {
    return this.order
      .map((id) => this.creators.get(id))
      .filter((c): c is MockCreator => Boolean(c));
  };

  getFollowedIds = (): Hex[] => {
    return Array.from(this.follows);
  };

  follow = (id: Hex) => {
    if (!this.creators.has(id)) return;
    this.follows.add(id);
    this.emit();
  };

  unfollow = (id: Hex) => {
    this.follows.delete(id);
    this.emit();
  };

  private seedUserSharesIfNeeded(userAddress: Hex) {
    if (this.hasUserShares) return;
    this.hasUserShares = true;
    const all = this.getAllCreators();
    const targets = [all[0], all[7], all[10]].filter(
      (c): c is MockCreator => Boolean(c),
    );
    let salt = 0;
    for (const c of targets) {
      const shares = 1000 + ((salt * 137 + userAddress.length * 13) % 4200);
      const costBasis = shares * (c.pricePerShare * 0.985);
      this.userShares.set(c.id, {
        creatorId: c.id,
        shares,
        costBasis,
        acquiredAt: Date.now() - (30 + salt * 12) * 86_400_000,
        entryPerfFeeBps: c.perfFeeBps,
      });
      salt++;
    }
    this.emit();
  }

  addUserShares = (
    creatorId: Hex,
    sharesAdded: number,
    costAdded: number,
    userAddress: Hex | undefined,
  ) => {
    if (userAddress) this.seedUserSharesIfNeeded(userAddress);
    const creator = this.creators.get(creatorId);
    if (!creator) return;
    const existing = this.userShares.get(creatorId);
    const next: MockUserShare = existing
      ? {
          ...existing,
          shares: existing.shares + sharesAdded,
          costBasis: existing.costBasis + costAdded,
        }
      : {
          creatorId,
          shares: sharesAdded,
          costBasis: costAdded,
          acquiredAt: Date.now(),
          entryPerfFeeBps: creator.perfFeeBps,
        };
    this.userShares.set(creatorId, next);

    const newNav = creator.nav + costAdded;
    const newSupply = creator.shareSupply + sharesAdded;
    this.creators.set(creatorId, {
      ...creator,
      nav: newNav,
      tvl: newNav,
      shareSupply: newSupply,
      pricePerShare: newSupply > 0 ? newNav / newSupply : 1,
      depositorCount: existing ? creator.depositorCount : creator.depositorCount + 1,
    });
    this.emit();
  };

  removeUserShares = (creatorId: Hex, sharesRemoved: number) => {
    const creator = this.creators.get(creatorId);
    const existing = this.userShares.get(creatorId);
    if (!creator || !existing) return;
    const ratio = Math.min(1, sharesRemoved / existing.shares);
    const costRemoved = existing.costBasis * ratio;
    const gross = sharesRemoved * creator.pricePerShare;

    if (sharesRemoved >= existing.shares) {
      this.userShares.delete(creatorId);
    } else {
      this.userShares.set(creatorId, {
        ...existing,
        shares: existing.shares - sharesRemoved,
        costBasis: existing.costBasis - costRemoved,
      });
    }

    const newNav = Math.max(0, creator.nav - gross);
    const newSupply = Math.max(0, creator.shareSupply - sharesRemoved);
    this.creators.set(creatorId, {
      ...creator,
      nav: newNav,
      tvl: newNav,
      shareSupply: newSupply,
      pricePerShare: newSupply > 0 ? newNav / newSupply : 1,
    });
    this.emit();
  };

  getUserShares = (
    userAddress: Hex | undefined,
    creatorId: Hex,
  ): MockUserShare | undefined => {
    if (!userAddress) return undefined;
    this.seedUserSharesIfNeeded(userAddress);
    return this.userShares.get(creatorId);
  };

  getAllUserShares = (userAddress: Hex | undefined): MockUserShare[] => {
    if (!userAddress) return [];
    this.seedUserSharesIfNeeded(userAddress);
    return Array.from(this.userShares.values());
  };

  getUserOwnVault = (_userAddress: Hex | undefined): MockCreator | null => {
    return null;
  };
}

let _singleton: MockStore | null = null;

export function getMockStore(): MockStore {
  if (!_singleton) _singleton = new MockStore();
  return _singleton;
}

export type { MockStore };
