import { type Address } from "viem";
import { Wallet } from "ethers";
import { v4 as uuidv4 } from "uuid";
import { ADDRS, CHAIN_ID, CLOB_BASE_URL } from "../config/index.js";
import { getEnv } from "../config/env.js";
import { buildL2Headers } from "./auth.js";
import { logger } from "../logger.js";

export const ORDER_SIDE = { BUY: 0, SELL: 1 } as const;
export const SIGNATURE_TYPE_EOA = 0;

export interface OrderParams {
  tokenId: string;
  price: number;
  size: number;
  side: 0 | 1;
  negRisk: boolean;
  expiration?: bigint;
}

export interface SignedOrder {
  clientOrderId: string;
  salt: string;
  maker: string;
  signer: string;
  taker: string;
  tokenId: string;
  makerAmount: string;
  takerAmount: string;
  expiration: string;
  nonce: string;
  feeRateBps: string;
  side: number;
  signatureType: number;
  signature: string;
}

const ORDER_TYPES = {
  Order: [
    { name: "salt", type: "uint256" },
    { name: "maker", type: "address" },
    { name: "signer", type: "address" },
    { name: "taker", type: "address" },
    { name: "tokenId", type: "uint256" },
    { name: "makerAmount", type: "uint256" },
    { name: "takerAmount", type: "uint256" },
    { name: "expiration", type: "uint256" },
    { name: "nonce", type: "uint256" },
    { name: "feeRateBps", type: "uint256" },
    { name: "side", type: "uint8" },
    { name: "signatureType", type: "uint8" },
  ],
};

const feeRateCache = new Map<string, { bps: number; fetchedAt: number }>();
const FEE_RATE_TTL_MS = 60_000;

export async function fetchFeeRateBps(tokenId: string): Promise<number> {
  const cached = feeRateCache.get(tokenId);
  if (cached && Date.now() - cached.fetchedAt < FEE_RATE_TTL_MS) {
    return cached.bps;
  }

  const headers = buildL2Headers("GET", `/fee-rate-bps?market=${tokenId}`);
  const res = await fetch(
    `${CLOB_BASE_URL}/fee-rate-bps?market=${tokenId}`,
    { headers },
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch feeRateBps: ${res.status}`);
  }

  const data = (await res.json()) as { fee_rate_bps: string };
  const bps = parseInt(data.fee_rate_bps, 10);
  feeRateCache.set(tokenId, { bps, fetchedAt: Date.now() });
  return bps;
}

function priceToAmounts(
  price: number,
  size: number,
  side: 0 | 1,
): { makerAmount: bigint; takerAmount: bigint } {
  const rawSize = BigInt(Math.round(size * 1_000_000));
  const rawPrice = BigInt(Math.round(price * 1_000_000));
  const oneShare = 1_000_000n;

  if (side === ORDER_SIDE.BUY) {
    const makerAmount = (rawSize * rawPrice) / oneShare;
    return { makerAmount, takerAmount: rawSize };
  } else {
    const takerAmount = (rawSize * rawPrice) / oneShare;
    return { makerAmount: rawSize, takerAmount };
  }
}

export async function signOrder(params: OrderParams): Promise<SignedOrder> {
  const env = getEnv();
  const wallet = new Wallet(env.POLYMARKET_PK);
  const clientOrderId = uuidv4();

  const feeRateBps = await fetchFeeRateBps(params.tokenId);
  const { makerAmount, takerAmount } = priceToAmounts(
    params.price,
    params.size,
    params.side,
  );

  const salt = BigInt(
    "0x" + [...Array(32)].map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, "0")).join(""),
  );
  const nonce = 0n;

  const domain = {
    name: "Polymarket CTF Exchange",
    version: "1",
    chainId: CHAIN_ID,
    verifyingContract: params.negRisk
      ? ADDRS.NEG_RISK_EXCHANGE
      : ADDRS.CTF_EXCHANGE,
  };

  const orderData = {
    salt,
    maker: wallet.address,
    signer: wallet.address,
    taker: "0x0000000000000000000000000000000000000000",
    tokenId: BigInt(params.tokenId),
    makerAmount,
    takerAmount,
    expiration: params.expiration ?? 0n,
    nonce,
    feeRateBps: BigInt(feeRateBps),
    side: params.side,
    signatureType: SIGNATURE_TYPE_EOA,
  };

  const signature = await wallet._signTypedData(domain, ORDER_TYPES, orderData);

  return {
    clientOrderId,
    salt: salt.toString(),
    maker: wallet.address,
    signer: wallet.address,
    taker: orderData.taker,
    tokenId: params.tokenId,
    makerAmount: makerAmount.toString(),
    takerAmount: takerAmount.toString(),
    expiration: (params.expiration ?? 0n).toString(),
    nonce: nonce.toString(),
    feeRateBps: feeRateBps.toString(),
    side: params.side,
    signatureType: SIGNATURE_TYPE_EOA,
    signature,
  };
}

export async function placeOrder(signed: SignedOrder): Promise<{ id: string }> {
  const body = JSON.stringify({
    order: {
      salt: signed.salt,
      maker: signed.maker,
      signer: signed.signer,
      taker: signed.taker,
      tokenId: signed.tokenId,
      makerAmount: signed.makerAmount,
      takerAmount: signed.takerAmount,
      expiration: signed.expiration,
      nonce: signed.nonce,
      feeRateBps: signed.feeRateBps,
      side: signed.side,
      signatureType: signed.signatureType,
      signature: signed.signature,
    },
    owner: signed.maker,
    orderType: "GTC",
  });

  const headers = {
    ...buildL2Headers("POST", "/order", body),
    "Content-Type": "application/json",
  };

  const res = await fetch(`${CLOB_BASE_URL}/order`, {
    method: "POST",
    headers,
    body,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Place order failed: ${res.status} ${errBody}`);
  }

  const data = (await res.json()) as { orderID: string };
  logger.info(
    { clientId: signed.clientOrderId, clobId: data.orderID, side: signed.side },
    "Order placed",
  );
  return { id: data.orderID };
}

export async function cancelOrder(orderId: string): Promise<void> {
  const body = JSON.stringify({ orderID: orderId });
  const headers = {
    ...buildL2Headers("DELETE", "/order", body),
    "Content-Type": "application/json",
  };

  const res = await fetch(`${CLOB_BASE_URL}/order`, {
    method: "DELETE",
    headers,
    body,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Cancel order failed: ${res.status} ${errBody}`);
  }
  logger.info({ orderId }, "Order cancelled");
}

export async function cancelAllOrders(): Promise<void> {
  const headers = buildL2Headers("DELETE", "/cancel-all");
  const res = await fetch(`${CLOB_BASE_URL}/cancel-all`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Cancel all failed: ${res.status} ${errBody}`);
  }
  logger.info("All orders cancelled");
}

export async function cancelMarketOrders(
  conditionId: string,
  assetId: string,
): Promise<void> {
  const body = JSON.stringify({ market: conditionId, asset_id: assetId });
  const headers = {
    ...buildL2Headers("DELETE", "/cancel-market-orders", body),
    "Content-Type": "application/json",
  };

  const res = await fetch(`${CLOB_BASE_URL}/cancel-market-orders`, {
    method: "DELETE",
    headers,
    body,
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Cancel market orders failed: ${res.status} ${errBody}`);
  }
  logger.info({ conditionId, assetId }, "Market orders cancelled");
}
