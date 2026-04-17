import { type Address, parseAbi } from "viem";
import { ADDRS } from "../config/addresses.js";
import { getPublicClient, getWalletClient, getAccount } from "./client.js";
import { logger } from "../logger.js";

interface OnChainOrder {
  salt: bigint;
  maker: Address;
  signer: Address;
  taker: Address;
  tokenId: bigint;
  makerAmount: bigint;
  takerAmount: bigint;
  expiration: bigint;
  nonce: bigint;
  feeRateBps: bigint;
  side: number;
  signatureType: number;
}

const exchangeAbi = parseAbi([
  "function cancelOrders((uint256 salt, address maker, address signer, address taker, uint256 tokenId, uint256 makerAmount, uint256 takerAmount, uint256 expiration, uint256 nonce, uint256 feeRateBps, uint8 side, uint8 signatureType)[] orders)",
]);

export async function onChainCancelOrders(
  orders: OnChainOrder[],
  negRisk: boolean,
): Promise<string> {
  const walletClient = getWalletClient();
  const publicClient = getPublicClient();
  const account = getAccount();

  const exchange = negRisk
    ? ADDRS.NEG_RISK_EXCHANGE
    : ADDRS.CTF_EXCHANGE;

  const orderTuples = orders.map((o) => ({
    salt: o.salt,
    maker: o.maker,
    signer: o.signer,
    taker: o.taker,
    tokenId: o.tokenId,
    makerAmount: o.makerAmount,
    takerAmount: o.takerAmount,
    expiration: o.expiration,
    nonce: o.nonce,
    feeRateBps: o.feeRateBps,
    side: o.side,
    signatureType: o.signatureType,
  }));

  logger.warn(
    { count: orders.length, negRisk },
    "Initiating on-chain fallback cancel",
  );

  const hash = await walletClient.writeContract({
    address: exchange as Address,
    abi: exchangeAbi,
    functionName: "cancelOrders",
    args: [orderTuples],
    chain: walletClient.chain,
    account,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  logger.info({ hash, count: orders.length }, "On-chain cancel confirmed");
  return hash;
}
