import { createHmac } from "crypto";
import { Wallet } from "ethers";
import { getEnv } from "../config/index.js";
import { logger } from "../logger.js";

export interface L2Credentials {
  apiKey: string;
  secret: string;
  passphrase: string;
}

const L1_AUTH_DOMAIN = {
  name: "ClobAuthDomain",
  version: "1",
  chainId: 137,
};

const L1_AUTH_TYPES = {
  ClobAuth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "message", type: "string" },
  ],
};

export async function deriveL2Credentials(
  privateKey: string,
): Promise<L2Credentials> {
  const wallet = new Wallet(privateKey);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = 0;

  const signature = await wallet._signTypedData(L1_AUTH_DOMAIN, L1_AUTH_TYPES, {
    address: wallet.address,
    timestamp,
    nonce,
    message: "This message attests that I control the given wallet",
  });

  const env = getEnv();
  const res = await fetch(`https://clob.polymarket.com/auth/derive-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: wallet.address,
      signature,
      timestamp,
      nonce,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to derive API key: ${res.status} ${body}`);
  }

  const data = (await res.json()) as L2Credentials;
  logger.info("L2 credentials derived successfully");
  return data;
}

export function buildL2Headers(
  method: string,
  requestPath: string,
  body: string = "",
): Record<string, string> {
  const env = getEnv();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const message = timestamp + method.toUpperCase() + requestPath + body;

  const hmac = createHmac("sha256", Buffer.from(env.POLYMARKET_API_SECRET, "base64"));
  hmac.update(message);
  const signature = hmac.digest("base64");

  return {
    POLY_ADDRESS: env.POLYMARKET_FUNDER,
    POLY_API_KEY: env.POLYMARKET_API_KEY,
    POLY_PASSPHRASE: env.POLYMARKET_API_PASSPHRASE,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp,
  };
}
