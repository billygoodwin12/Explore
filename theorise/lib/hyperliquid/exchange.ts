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

async function signAction(
  walletClient: WalletClient,
  action: Record<string, unknown>,
  nonce: number,
) {
  const connectionId = actionHash(action, nonce);
  // 'a' = mainnet
  const phantomAgent = { source: 'a', connectionId };

  // Hyperliquid uses chainId 1337 in its EIP-712 domain, but wallet is on 42161.
  // Viem validates chainId at every layer, so we must go directly to the
  // underlying EIP-1193 provider to bypass all viem validation.
  const account = walletClient.account!;
  const typedData = JSON.stringify({
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
  });

  // We need the raw EIP-1193 provider that does NOT validate chainId.
  // viem's transport.request wraps the provider and validates chainId,
  // so we must extract the underlying raw provider.
  type EIP1193Provider = { request: (args: { method: string; params: unknown[] }) => Promise<unknown> };

  // Strategy: get the raw provider from window.ethereum or its multi-provider list
  let provider: EIP1193Provider | undefined;

  if (typeof window !== 'undefined') {
    const win = window as unknown as {
      ethereum?: EIP1193Provider & {
        providers?: EIP1193Provider[];
        isMetaMask?: boolean;
        isPhantom?: boolean;
        isCoinbaseWallet?: boolean;
        providerMap?: Map<string, EIP1193Provider>;
      };
    };

    if (win.ethereum) {
      // EIP-6963 multi-provider: wagmi uses providerMap or providers array
      // Try to find the specific provider that matches the connected wallet
      if (win.ethereum.providerMap) {
        // providerMap is used by some wallets
        for (const [, p] of win.ethereum.providerMap) {
          if ((p as EIP1193Provider).request) {
            provider = p;
            break;
          }
        }
      }
      if (!provider && win.ethereum.providers?.length) {
        // Multiple injected providers — just use the first one
        // (wagmi routes to the correct one via connector)
        provider = win.ethereum.providers[0];
      }
      if (!provider) {
        provider = win.ethereum;
      }
    }
  }

  if (!provider) {
    throw new Error('No wallet provider found. Please install MetaMask or another wallet.');
  }

  const signature = await provider.request({
    method: 'eth_signTypedData_v4',
    params: [account.address, typedData],
  }) as string;

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
