import { encode } from '@msgpack/msgpack';
import { keccak256, type WalletClient } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';

const MAINNET_EXCHANGE = 'https://api.hyperliquid.xyz/exchange';
const MAINNET_INFO = 'https://api.hyperliquid.xyz/info';

// ── Phantom agent domain (L1 actions, signed locally by agent key) ──
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

// ── User-signed action domain (signed by MetaMask) ──
// chainId is filled in at sign-time from the wallet's active chain so
// MetaMask's domain-chainId validator is satisfied.
const USER_SIGN_DOMAIN_BASE = {
  name: 'HyperliquidSignTransaction',
  version: '1',
  verifyingContract: '0x0000000000000000000000000000000000000000' as `0x${string}`,
} as const;

const APPROVE_AGENT_TYPE = [
  { name: 'hyperliquidChain', type: 'string' },
  { name: 'agentAddress', type: 'address' },
  { name: 'agentName', type: 'string' },
  { name: 'nonce', type: 'uint64' },
];

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
 * Sign an L1 action (orders, cancels, leverage, …) locally with the
 * agent's private key. No wallet, no chainId validation, no prompts.
 */
async function signL1Action(
  agent: PrivateKeyAccount,
  action: Record<string, unknown>,
  nonce: number,
) {
  const connectionId = actionHash(action, nonce);
  const signature = await agent.signTypedData({
    domain: PHANTOM_DOMAIN,
    types: AGENT_TYPES,
    primaryType: 'Agent',
    message: { source: 'a', connectionId },
  });

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

export async function getClearinghouseState(
  address: string,
  dex?: string,
): Promise<ClearinghouseState> {
  const body: Record<string, unknown> = { type: 'clearinghouseState', user: address };
  if (dex) body.dex = dex;
  const res = await fetch(MAINNET_INFO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await res.json();
}

export interface PerpDex {
  name: string;
  fullName: string;
}

export async function getPerpDexs(): Promise<(PerpDex | null)[]> {
  const res = await fetch(MAINNET_INFO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'perpDexs' }),
  });
  if (!res.ok) return [null];
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

// ── User-signed actions (MetaMask) ───────────────────────────────

/**
 * Approve a local agent wallet for trading on behalf of the user.
 * Signed by MetaMask using the user-signed domain whose chainId is
 * the wallet's active chain — so MetaMask's domain validator passes.
 */
export async function approveAgent(
  walletClient: WalletClient,
  agentAddress: string,
  agentName: string = 'theorise',
): Promise<OrderResult> {
  const account = walletClient.account!;
  const activeChainId = walletClient.chain?.id ?? 42161;
  const sigChainHex = `0x${activeChainId.toString(16)}` as const;
  const nonce = Date.now();

  // Body sent over the wire
  const action = {
    type: 'approveAgent',
    hyperliquidChain: 'Mainnet',
    signatureChainId: sigChainHex,
    agentAddress,
    agentName,
    nonce,
  };

  // Typed-data payload for MetaMask
  const typedData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      'HyperliquidTransaction:ApproveAgent': APPROVE_AGENT_TYPE,
    },
    primaryType: 'HyperliquidTransaction:ApproveAgent',
    domain: {
      ...USER_SIGN_DOMAIN_BASE,
      chainId: activeChainId,
    },
    message: {
      hyperliquidChain: 'Mainnet',
      agentAddress,
      agentName,
      nonce,
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  if (!win.ethereum) {
    throw new Error('MetaMask not detected. Please install MetaMask.');
  }

  console.log('[Hyperliquid] approveAgent typed data:', typedData);

  let signature: string;
  try {
    signature = await win.ethereum.request({
      method: 'eth_signTypedData_v4',
      params: [account.address, JSON.stringify(typedData)],
    });
  } catch (e: unknown) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const err = e as any;
    const msg = err?.message || err?.code || err?.toString?.() || 'Unknown signing error';
    throw new Error(`Agent approval signing failed: ${msg}`);
  }

  const r = `0x${signature.slice(2, 66)}`;
  const s = `0x${signature.slice(66, 130)}`;
  const v = parseInt(signature.slice(130, 132), 16);

  const res = await fetch(MAINNET_EXCHANGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature: { r, s, v } }),
  });
  return await res.json();
}

// ── L1 actions (signed locally by the agent key) ─────────────────

/** Place a market order (IOC at slippage price) */
export async function placeMarketOrder(
  agent: PrivateKeyAccount,
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

  const signature = await signL1Action(agent, action, nonce);

  const res = await fetch(MAINNET_EXCHANGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature }),
  });

  return await res.json();
}

/** Close a position (market order, reduce-only) */
export async function closePosition(
  agent: PrivateKeyAccount,
  assetIndex: number,
  szDecimals: number,
  currentSize: number,
  currentPrice: number,
): Promise<OrderResult> {
  const isBuy = currentSize < 0; // if short, buy to close
  const absSize = Math.abs(currentSize).toFixed(szDecimals);
  const slippagePrice = isBuy
    ? (currentPrice * 1.03).toFixed(currentPrice > 1000 ? 0 : currentPrice > 10 ? 1 : 4)
    : (currentPrice * 0.97).toFixed(currentPrice > 1000 ? 0 : currentPrice > 10 ? 1 : 4);

  return placeMarketOrder(agent, assetIndex, isBuy, absSize, slippagePrice, true);
}

/** Update leverage for an asset */
export async function updateLeverage(
  agent: PrivateKeyAccount,
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

  const signature = await signL1Action(agent, action, nonce);

  const res = await fetch(MAINNET_EXCHANGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature }),
  });

  return await res.json();
}

/** Cancel an order */
export async function cancelOrder(
  agent: PrivateKeyAccount,
  assetIndex: number,
  oid: number,
): Promise<OrderResult> {
  const nonce = Date.now();

  const action: Record<string, unknown> = {
    type: 'cancel',
    cancels: [{ a: assetIndex, o: oid }],
  };

  const signature = await signL1Action(agent, action, nonce);

  const res = await fetch(MAINNET_EXCHANGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature }),
  });

  return await res.json();
}
