export type Hex = `0x${string}`;

export type AssetClass = "perps" | "commodities" | "equities";

export type PositionSide = "long" | "short";

export type MockPosition = {
  id: string;
  asset: string;
  side: PositionSide;
  coins: number;
  entryPrice: number;
  markPrice: number;
  leverage: number;
  openedAt: number;
};

export type MockFill = {
  id: string;
  asset: string;
  side: PositionSide;
  coins: number;
  price: number;
  feeUsdc: number;
  txHash: Hex;
  filledAt: number;
};

export type MockCreator = {
  id: Hex;
  creatorAddress: Hex;
  handle: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  joinedAt: number;
  assetClass: AssetClass;

  nav: number;
  shareSupply: number;
  pricePerShare: number;
  tvl: number;

  creatorStakeUsdc: number;
  creatorStakeBps: number;
  cureWindowStartedAt: number | null;

  followCount: number;
  depositorCount: number;

  perfFeeBps: number;
  depositFeeBps: number;

  pnl7dBps: number;
  pnl30dBps: number;
  pnlInceptionBps: number;
  weeklyReturns: number[];
  winRate: number;
  lossStreakWeeks: number;

  navHistory: number[];
  openPositions: MockPosition[];
  recentFills: MockFill[];

  isActive: boolean;
};

export type MockUserShare = {
  creatorId: Hex;
  shares: number;
  costBasis: number;
  acquiredAt: number;
  entryPerfFeeBps: number;
};

export type QueryLike<T> = {
  data: T | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
};
