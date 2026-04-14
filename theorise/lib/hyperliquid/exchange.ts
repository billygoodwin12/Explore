import { encode } from '@msgpack/msgpack';
import { keccak256, type WalletClient } from 'viem';

const MAINNET_EXCHANGE = 'https://api.hyperliquid.xyz/exchange';
const MAINNET_INFO = 'https://api.hyperliquid.xyz/info';

const PHANTOM_DOMAIN = {
  name: 'Exchange',
  version: '1',
  chainId: 1337,
  verifyingContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
} as const;

const AGENT_TYPES = {
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
} as const;

/** Remove trailing zeros from stringified numbers (Hyperliquid requirement) */
function normalizeNumber(s: string): string {
  if (!s.includes('.')) return s;
  let result = s.replace(/0+$/, '');
  if (result.endsWith('.')) result = result.slice(0, -1);
  return result;
}

function normalizeAction(action: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(action), (_, value) => {
    if (typeof value === 'string' && /^\d+\.?\d*$/.test(value)) {
      return normalizeNumber(value);
    }
    return value;
  });
}

function actionHash(action: Record<string, unknown>, nonce: number): `0x${string}` {
  const normalized = normalizeAction(action);
  const msgPackBytes = encode(normalized);
  const data = new Uint8Array(msgPackBytes.length + 9);
  data.set(new Uint8Array(msgPackBytes));
  const view = new DataView(data.buffer);
  view.setBigUint64(msgPackBytes.length, BigInt(nonce), false);
  view.setUint8(msgPackBytes.length + 8, 0);
  return keccak256(data);
}

/**
 * MVP signing — bare metal MetaMask only.
 *
 * Calls eth_signTypedData_v4 directly on window.ethereum (which is MetaMask
 * since we disabled multiInjectedProviderDiscovery and only configured the
 * metaMask connector). No viem wrapper, no provider discovery, no fallbacks.
 */
async function signAction(
  walletClient: WalletClient,
  action: Record<string, unknown>,
  nonce: number,
) {
  const connectionId = actionHash(action, nonce);
  const phantomAgent = { source: 'a' as const, connectionId }; // 'a' = mainnet

  const account = walletClient.account!;

  // Build the typed data exactly as MetaMask expects
  const typedData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
      ],
    },
    primaryType: 'Agent',
    domain: PHANTOM_DOMAIN,
    message: phantomAgent,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  if (!win.ethereum) {
    throw new Error('MetaMask not detected. Please install MetaMask.');
  }

  console.log('[Hyperliquid] Signing action:', action);
  console.log('[Hyperliquid] Typed data:', typedData);
  console.log('[Hyperliquid] Account:', account.address);

  let signature: string;
  try {
    signature = await win.ethereum.request({
      method: 'eth_signTypedData_v4',
      params: [account.address, JSON.stringify(typedData)],
    });
    console.log('[Hyperliquid] Signature received:', signature);
  } catch (e) {
    console.error('[Hyperliquid] Signing failed:', e);
    throw e;
  }

  const r = `0x${signature.slice(2, 66)}`;
  const s = `0x${signature.slice(66, 130)}`;
  const v = parseInt(signature.slice(130, 132), 16);
  return { r, s, v };
}

// ── Types ────────────────────────────────────────────────────────

export interface OrderResult {
  status: string;
  response?: string | {
    type: string;
    data?: {
      statuses: Array<{
        resting?: { oid: number };
        filled?: { oid: number; totalSz: string; avgPx: string };
        error?: string;
      }>;
    };
  };
  error?: string;
}

export interface Position {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  returnOnEquity: string;
  leverage: { type: string; value: number };
  liquidationPx: string | null;
  marginUsed: string;
}

export interface ClearinghouseState {
  assetPositions: Array<{ position: Position }>;
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
  };
  withdrawable: string;
  crossMaintenanceMarginUsed: string;
}

// ── Info endpoints ───────────────────────────────────────────────

export async function getClearinghouseState(address: string): Promise<ClearinghouseState> {
  const res = await fetch(MAINNET_INFO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'clearinghouseState', user: address }),
  });
  return await res.json();
}

export interface SpotBalance {
  coin: string;
  token: number;
  hold: string;
  total: string;
  entryNtl: string;
}

export interface SpotClearinghouseState {
  balances: SpotBalance[];
}

export async function getSpotClearinghouseState(address: string): Promise<SpotClearinghouseState> {
  const res = await fetch(MAINNET_INFO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'spotClearinghouseState', user: address }),
  });
  return await res.json();
}

export async function getOpenOrders(address: string) {
  const res = await fetch(MAINNET_INFO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'openOrders', user: address }),
  });
  return await res.json();
}

export async function getUserFills(address: string) {
  const res = await fetch(MAINNET_INFO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'userFills', user: address }),
  });
  return await res.json();
}

/** Get the universe index for a coin */
let universeCache: { name: string; maxLeverage: number; szDecimals: number }[] | null = null;

export async function getUniverse() {
  if (universeCache) return universeCache;
  const res = await fetch(MAINNET_INFO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'meta' }),
  });
  const meta = await res.json();
  universeCache = meta.universe;
  return universeCache!;
}

export async function getAssetIndex(coin: string): Promise<number> {
  const universe = await getUniverse();
  const idx = universe.findIndex(a => a.name === coin);
  if (idx === -1) throw new Error(`Asset ${coin} not found`);
  return idx;
}

export async function getSzDecimals(coin: string): Promise<number> {
  const universe = await getUniverse();
  const asset = universe.find(a => a.name === coin);
  return asset?.szDecimals ?? 2;
}

// ── Exchange endpoints ───────────────────────────────────────────

/** Place a market order (IOC at slippage price) */
export async function placeMarketOrder(
  walletClient: WalletClient,
  assetIndex: number,
  isBuy: boolean,
  size: string,
  price: string,
  reduceOnly: boolean = false,
): Promise<OrderResult> {
  const nonce = Date.now();

  const action: Record<string, unknown> = {
    type: 'order',
    orders: [
      {
        a: assetIndex,
        b: isBuy,
        p: normalizeNumber(price),
        s: normalizeNumber(size),
        r: reduceOnly,
        t: { limit: { tif: 'Ioc' } },
      },
    ],
    grouping: 'na',
  };

  const signature = await signAction(walletClient, action, nonce);

  const res = await fetch(MAINNET_EXCHANGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature }),
  });

  return await res.json();
}

/** Close a position (market order, reduce-only) */
export async function closePosition(
  walletClient: WalletClient,
  coin: string,
  currentSize: number,
  currentPrice: number,
): Promise<OrderResult> {
  const assetIndex = await getAssetIndex(coin);
  const szDecimals = await getSzDecimals(coin);
  const isBuy = currentSize < 0; // if short, buy to close
  const absSize = Math.abs(currentSize).toFixed(szDecimals);
  const slippagePrice = isBuy
    ? (currentPrice * 1.03).toFixed(currentPrice > 1000 ? 0 : currentPrice > 10 ? 1 : 4)
    : (currentPrice * 0.97).toFixed(currentPrice > 1000 ? 0 : currentPrice > 10 ? 1 : 4);

  return placeMarketOrder(walletClient, assetIndex, isBuy, absSize, slippagePrice, true);
}

/** Update leverage for an asset */
export async function updateLeverage(
  walletClient: WalletClient,
  assetIndex: number,
  leverage: number,
  isCross: boolean = true,
): Promise<OrderResult> {
  const nonce = Date.now();

  const action: Record<string, unknown> = {
    type: 'updateLeverage',
    asset: assetIndex,
    isCross: isCross,
    leverage: leverage,
  };

  const signature = await signAction(walletClient, action, nonce);

  const res = await fetch(MAINNET_EXCHANGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature }),
  });

  return await res.json();
}

/** Cancel an order */
export async function cancelOrder(
  walletClient: WalletClient,
  assetIndex: number,
  oid: number,
): Promise<OrderResult> {
  const nonce = Date.now();

  const action: Record<string, unknown> = {
    type: 'cancel',
    cancels: [{ a: assetIndex, o: oid }],
  };

  const signature = await signAction(walletClient, action, nonce);

  const res = await fetch(MAINNET_EXCHANGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature }),
  });

  return await res.json();
}
