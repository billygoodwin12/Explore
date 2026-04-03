import { encode } from '@msgpack/msgpack';
import { keccak256, type WalletClient } from 'viem';

const TESTNET_EXCHANGE = 'https://api.hyperliquid-testnet.xyz/exchange';
const TESTNET_INFO = 'https://api.hyperliquid-testnet.xyz/info';

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

function actionHash(action: Record<string, unknown>, nonce: number, vaultAddress: string | null = null): `0x${string}` {
  const normalized = normalizeAction(action);
  const msgPackBytes = encode(normalized);
  const additionalBytes = vaultAddress === null ? 9 : 29;
  const data = new Uint8Array(msgPackBytes.length + additionalBytes);
  data.set(new Uint8Array(msgPackBytes));

  const view = new DataView(data.buffer);
  view.setBigUint64(msgPackBytes.length, BigInt(nonce), false);

  if (vaultAddress === null) {
    view.setUint8(msgPackBytes.length + 8, 0);
  } else {
    view.setUint8(msgPackBytes.length + 8, 1);
    const addrBytes = hexToBytes(vaultAddress);
    data.set(addrBytes, msgPackBytes.length + 9);
  }

  return keccak256(data);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function signAction(
  walletClient: WalletClient,
  action: Record<string, unknown>,
  nonce: number,
) {
  const connectionId = actionHash(action, nonce);
  const phantomAgent = { source: 'b', connectionId }; // 'b' = testnet

  const signature = await walletClient.signTypedData({
    account: walletClient.account!,
    domain: PHANTOM_DOMAIN,
    types: AGENT_TYPES,
    primaryType: 'Agent',
    message: phantomAgent,
  });

  // Parse signature into r, s, v
  const r = `0x${signature.slice(2, 66)}`;
  const s = `0x${signature.slice(66, 130)}`;
  const v = parseInt(signature.slice(130, 132), 16);

  return { r, s, v };
}

export interface OrderResult {
  status: 'ok' | 'err';
  response?: {
    type: string;
    data?: { statuses: Array<{ resting?: { oid: number }; filled?: { oid: number; totalSz: string; avgPx: string }; error?: string }> };
  };
  error?: string;
}

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
        c: null,
      },
    ],
    grouping: 'na',
  };

  const signature = await signAction(walletClient, action, nonce);

  const res = await fetch(TESTNET_EXCHANGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature }),
  });

  const data = await res.json();
  return data;
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

  const res = await fetch(TESTNET_EXCHANGE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, nonce, signature }),
  });

  return await res.json();
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
}

export interface ClearinghouseState {
  assetPositions: Array<{ position: Position }>;
  marginSummary: {
    accountValue: string;
    totalMarginUsed: string;
    totalNtlPos: string;
  };
  withdrawable: string;
}

/** Get clearinghouse state (positions, margin, etc.) */
export async function getClearinghouseState(address: string): Promise<ClearinghouseState> {
  const res = await fetch(TESTNET_INFO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'clearinghouseState', user: address }),
  });
  return await res.json();
}

/** Get asset index from universe */
export async function getAssetIndex(coin: string): Promise<number> {
  const res = await fetch(TESTNET_INFO, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'meta' }),
  });
  const meta = await res.json();
  const idx = meta.universe.findIndex((a: { name: string }) => a.name === coin);
  if (idx === -1) throw new Error(`Asset ${coin} not found`);
  return idx;
}
