import { addrFromSeed, pickFloat, pickInt, seededRng } from "@/lib/mock/prng";
import type { AssetClass, Hex, MockCreator } from "@/lib/mock/types";

const STAKE_FLOOR_BPS = 500;
const ONE_DAY = 86_400_000;
const ONE_HOUR = 3_600_000;

type EdgeCase =
  | "healthy-popular"
  | "at-floor"
  | "cure-12h"
  | "cure-36h"
  | "no-follows"
  | "brand-new"
  | "losing-streak"
  | "commodities"
  | "equities"
  | "high-perf-low-tvl"
  | "balanced"
  | "second-popular";

type Seed = {
  handle: string;
  displayName: string;
  bio: string;
  joinedDaysAgo: number;
  assetClass: AssetClass;
  edgeCase: EdgeCase;
};

const SEEDS: Seed[] = [
  {
    handle: "alice.eth",
    displayName: "Alice Tanaka",
    bio: "ETH/BTC perps · momentum follower · risk-on bias",
    joinedDaysAgo: 287,
    assetClass: "perps",
    edgeCase: "healthy-popular",
  },
  {
    handle: "brendan.eth",
    displayName: "Brendan Yi",
    bio: "Mean-reversion across majors. Patient sizing.",
    joinedDaysAgo: 134,
    assetClass: "perps",
    edgeCase: "at-floor",
  },
  {
    handle: "cyrus.eth",
    displayName: "Cyrus Patel",
    bio: "Long-vol structure. Drawdown control via stop discipline.",
    joinedDaysAgo: 92,
    assetClass: "perps",
    edgeCase: "cure-12h",
  },
  {
    handle: "dani.eth",
    displayName: "Dani Okafor",
    bio: "Macro-flavored crypto perps. Built for chop.",
    joinedDaysAgo: 178,
    assetClass: "perps",
    edgeCase: "cure-36h",
  },
  {
    handle: "erin.eth",
    displayName: "Erin Schmidt",
    bio: "Discretionary. Light book, careful entries.",
    joinedDaysAgo: 51,
    assetClass: "perps",
    edgeCase: "no-follows",
  },
  {
    handle: "fenton.eth",
    displayName: "Fenton Cho",
    bio: "Brand new vault. Building track record.",
    joinedDaysAgo: 8,
    assetClass: "perps",
    edgeCase: "brand-new",
  },
  {
    handle: "gus.eth",
    displayName: "Gus Noor",
    bio: "Contrarian alpha. Currently in drawdown — same playbook.",
    joinedDaysAgo: 412,
    assetClass: "perps",
    edgeCase: "losing-streak",
  },
  {
    handle: "hana.eth",
    displayName: "Hana Li",
    bio: "HIP-3 commodities. Gold/oil/copper rotations.",
    joinedDaysAgo: 198,
    assetClass: "commodities",
    edgeCase: "commodities",
  },
  {
    handle: "ivan.eth",
    displayName: "Ivan Rodriguez",
    bio: "HIP-3 equities (xyz). Earnings-cycle plays.",
    joinedDaysAgo: 64,
    assetClass: "equities",
    edgeCase: "equities",
  },
  {
    handle: "jules.eth",
    displayName: "Jules Saunders",
    bio: "Hidden gem. Small book, sharp execution.",
    joinedDaysAgo: 89,
    assetClass: "perps",
    edgeCase: "high-perf-low-tvl",
  },
  {
    handle: "kai.eth",
    displayName: "Kai Martinez",
    bio: "Mid-cap perps rotation. Weekly rebalance.",
    joinedDaysAgo: 221,
    assetClass: "perps",
    edgeCase: "second-popular",
  },
  {
    handle: "luna.eth",
    displayName: "Luna Park",
    bio: "Trend-following with vol-targeting overlay.",
    joinedDaysAgo: 156,
    assetClass: "perps",
    edgeCase: "balanced",
  },
];

function buildHistory(rng: () => number, base: number, drift: number, points = 24): number[] {
  const out: number[] = [];
  let v = base * (1 - drift * 0.6);
  for (let i = 0; i < points; i++) {
    const step = (rng() - 0.45) * 0.008;
    v = Math.max(v * (1 + step + drift / points), 1);
    out.push(v);
  }
  out[out.length - 1] = base;
  return out;
}

function buildWeeklyReturns(rng: () => number, edgeCase: EdgeCase): number[] {
  const weeks = 12;
  const out: number[] = [];

  if (edgeCase === "losing-streak") {
    for (let i = 0; i < weeks; i++) {
      out.push(Math.round(pickFloat(rng, -380, -40)));
    }
    return out;
  }

  if (edgeCase === "high-perf-low-tvl") {
    for (let i = 0; i < weeks; i++) {
      const r = rng();
      out.push(Math.round(r < 0.2 ? pickFloat(rng, -90, 30) : pickFloat(rng, 60, 420)));
    }
    return out;
  }

  for (let i = 0; i < weeks; i++) {
    out.push(Math.round(pickFloat(rng, -220, 260)));
  }
  return out;
}

function build(seed: Seed): MockCreator {
  const rng = seededRng(seed.handle);
  const creatorAddress = addrFromSeed(`${seed.handle}:creator`);
  const id = addrFromSeed(`${seed.handle}:vault`);
  const now = Date.now();
  const joinedAt = now - seed.joinedDaysAgo * ONE_DAY;

  let nav: number;
  let creatorStakeBps: number;
  let cureWindowStartedAt: number | null = null;
  let followCount: number;
  let depositorCount: number;
  let pnl30dBps: number;
  let pnl7dBps: number;

  switch (seed.edgeCase) {
    case "healthy-popular":
      nav = pickFloat(rng, 1_100_000, 1_650_000);
      creatorStakeBps = pickInt(rng, 900, 1400);
      followCount = pickInt(rng, 210, 320);
      depositorCount = pickInt(rng, 140, 260);
      pnl30dBps = pickInt(rng, 1800, 3400);
      pnl7dBps = pickInt(rng, 200, 600);
      break;
    case "at-floor":
      nav = pickFloat(rng, 380_000, 540_000);
      creatorStakeBps = pickInt(rng, 502, 540);
      followCount = pickInt(rng, 28, 64);
      depositorCount = pickInt(rng, 18, 48);
      pnl30dBps = pickInt(rng, -550, -120);
      pnl7dBps = pickInt(rng, -300, 80);
      break;
    case "cure-12h":
      nav = pickFloat(rng, 240_000, 320_000);
      creatorStakeBps = pickInt(rng, 360, 420);
      cureWindowStartedAt = now - 12 * ONE_HOUR;
      followCount = pickInt(rng, 14, 38);
      depositorCount = pickInt(rng, 9, 24);
      pnl30dBps = pickInt(rng, -1400, -600);
      pnl7dBps = pickInt(rng, -800, -200);
      break;
    case "cure-36h":
      nav = pickFloat(rng, 480_000, 620_000);
      creatorStakeBps = pickInt(rng, 380, 460);
      cureWindowStartedAt = now - 36 * ONE_HOUR;
      followCount = pickInt(rng, 42, 78);
      depositorCount = pickInt(rng, 28, 56);
      pnl30dBps = pickInt(rng, -1800, -900);
      pnl7dBps = pickInt(rng, -1200, -400);
      break;
    case "no-follows":
      nav = pickFloat(rng, 28_000, 64_000);
      creatorStakeBps = pickInt(rng, 1800, 3200);
      followCount = 0;
      depositorCount = 0;
      pnl30dBps = pickInt(rng, -200, 220);
      pnl7dBps = pickInt(rng, -120, 140);
      break;
    case "brand-new":
      nav = pickFloat(rng, 14_000, 28_000);
      creatorStakeBps = pickInt(rng, 1000, 1600);
      followCount = pickInt(rng, 3, 14);
      depositorCount = pickInt(rng, 2, 8);
      pnl30dBps = pickInt(rng, 80, 480);
      pnl7dBps = pickInt(rng, 60, 320);
      break;
    case "losing-streak":
      nav = pickFloat(rng, 220_000, 320_000);
      creatorStakeBps = pickInt(rng, 1100, 1500);
      followCount = pickInt(rng, 88, 124);
      depositorCount = pickInt(rng, 64, 96);
      pnl30dBps = pickInt(rng, -2600, -1400);
      pnl7dBps = pickInt(rng, -900, -300);
      break;
    case "commodities":
      nav = pickFloat(rng, 640_000, 880_000);
      creatorStakeBps = pickInt(rng, 750, 1100);
      followCount = pickInt(rng, 64, 96);
      depositorCount = pickInt(rng, 42, 78);
      pnl30dBps = pickInt(rng, 400, 1400);
      pnl7dBps = pickInt(rng, 80, 380);
      break;
    case "equities":
      nav = pickFloat(rng, 320_000, 480_000);
      creatorStakeBps = pickInt(rng, 800, 1200);
      followCount = pickInt(rng, 38, 72);
      depositorCount = pickInt(rng, 24, 56);
      pnl30dBps = pickInt(rng, 600, 1800);
      pnl7dBps = pickInt(rng, 120, 460);
      break;
    case "high-perf-low-tvl":
      nav = pickFloat(rng, 38_000, 68_000);
      creatorStakeBps = pickInt(rng, 2400, 3800);
      followCount = pickInt(rng, 18, 42);
      depositorCount = pickInt(rng, 12, 28);
      pnl30dBps = pickInt(rng, 2800, 4800);
      pnl7dBps = pickInt(rng, 400, 1200);
      break;
    case "second-popular":
      nav = pickFloat(rng, 720_000, 940_000);
      creatorStakeBps = pickInt(rng, 800, 1200);
      followCount = pickInt(rng, 140, 200);
      depositorCount = pickInt(rng, 96, 158);
      pnl30dBps = pickInt(rng, 800, 2200);
      pnl7dBps = pickInt(rng, 80, 480);
      break;
    case "balanced":
      nav = pickFloat(rng, 280_000, 420_000);
      creatorStakeBps = pickInt(rng, 700, 1100);
      followCount = pickInt(rng, 48, 88);
      depositorCount = pickInt(rng, 32, 68);
      pnl30dBps = pickInt(rng, 200, 1200);
      pnl7dBps = pickInt(rng, -120, 360);
      break;
  }

  const shareSupply = nav / pickFloat(rng, 0.96, 1.08);
  const pricePerShare = shareSupply > 0 ? nav / shareSupply : 1;
  const creatorStakeUsdc = (nav * creatorStakeBps) / 10_000;
  const drift = pnl30dBps / 10_000;
  const navHistory = buildHistory(rng, nav, drift, 24);
  const weeklyReturns = buildWeeklyReturns(rng, seed.edgeCase);
  const wins = weeklyReturns.filter((r) => r > 0).length;
  const winRate = weeklyReturns.length > 0 ? wins / weeklyReturns.length : 0;
  const lossStreakWeeks = (() => {
    let n = 0;
    for (let i = weeklyReturns.length - 1; i >= 0; i--) {
      if (weeklyReturns[i]! < 0) n++;
      else break;
    }
    return n;
  })();
  const pnlInceptionBps = Math.round(
    weeklyReturns.reduce((acc, r) => acc + r, 0),
  );

  return {
    id,
    creatorAddress,
    handle: seed.handle,
    displayName: seed.displayName,
    bio: seed.bio,
    joinedAt,
    assetClass: seed.assetClass,

    nav,
    shareSupply,
    pricePerShare,
    tvl: nav,

    creatorStakeUsdc,
    creatorStakeBps,
    cureWindowStartedAt,

    followCount,
    depositorCount,

    mgmtFeeBps: pickInt(rng, 100, 200),
    perfFeeBps: pickInt(rng, 1000, 2000),
    depositFeeBps: pickInt(rng, 0, 50),

    pnl7dBps,
    pnl30dBps,
    pnlInceptionBps,
    weeklyReturns,
    winRate,
    lossStreakWeeks,

    navHistory,

    isActive: true,
  };
}

export function buildMockCreators(): MockCreator[] {
  return SEEDS.map(build);
}

export const MOCK_CREATOR_HANDLES = SEEDS.map((s) => s.handle);
export const STAKE_FLOOR_BPS_CONST = STAKE_FLOOR_BPS;

export function findCreatorByHandle(
  creators: MockCreator[],
  handle: string,
): MockCreator | undefined {
  return creators.find((c) => c.handle === handle);
}

export function findCreatorById(
  creators: MockCreator[],
  id: Hex,
): MockCreator | undefined {
  return creators.find((c) => c.id === id);
}
