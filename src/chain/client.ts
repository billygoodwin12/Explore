import {
  createPublicClient,
  createWalletClient,
  http,
  type PublicClient,
  type WalletClient,
  type Chain,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { getEnv } from "../config/index.js";

let _publicClient: PublicClient | null = null;
let _walletClient: WalletClient | null = null;
let _account: PrivateKeyAccount | null = null;

export function getAccount(): PrivateKeyAccount {
  if (_account) return _account;
  const env = getEnv();
  _account = privateKeyToAccount(env.POLYMARKET_PK as `0x${string}`);
  return _account;
}

export function getPublicClient(): PublicClient {
  if (_publicClient) return _publicClient;
  const env = getEnv();
  _publicClient = createPublicClient({
    chain: polygon as Chain,
    transport: http(env.POLYGON_RPC_URL),
  });
  return _publicClient;
}

export function getWalletClient(): WalletClient {
  if (_walletClient) return _walletClient;
  const env = getEnv();
  const account = getAccount();
  _walletClient = createWalletClient({
    account,
    chain: polygon as Chain,
    transport: http(env.POLYGON_RPC_URL),
  });
  return _walletClient;
}
