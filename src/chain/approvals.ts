import { type Address, maxUint256, parseAbi } from "viem";
import { ADDRS } from "../config/addresses.js";
import { getPublicClient, getWalletClient, getAccount } from "./client.js";
import { logger } from "../logger.js";

const erc20Abi = parseAbi([
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

const erc1155Abi = parseAbi([
  "function isApprovedForAll(address account, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
]);

const SPENDERS: Address[] = [
  ADDRS.CTF_EXCHANGE as Address,
  ADDRS.NEG_RISK_EXCHANGE as Address,
  ADDRS.NEG_RISK_ADAPTER as Address,
];

export async function ensureErc20Approvals(): Promise<void> {
  const publicClient = getPublicClient();
  const walletClient = getWalletClient();
  const account = getAccount();

  for (const spender of SPENDERS) {
    const allowance = await publicClient.readContract({
      address: ADDRS.USDCE as Address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account.address, spender],
    });

    if (allowance >= maxUint256 / 2n) {
      logger.info({ spender }, "USDC.e allowance already set");
      continue;
    }

    logger.info({ spender }, "Approving USDC.e...");
    const hash = await walletClient.writeContract({
      address: ADDRS.USDCE as Address,
      abi: erc20Abi,
      functionName: "approve",
      args: [spender, maxUint256],
      chain: walletClient.chain,
      account: account,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    logger.info({ spender, hash }, "USDC.e approved");
  }
}

export async function ensureErc1155Approvals(): Promise<void> {
  const publicClient = getPublicClient();
  const walletClient = getWalletClient();
  const account = getAccount();

  for (const spender of SPENDERS) {
    const approved = await publicClient.readContract({
      address: ADDRS.CTF as Address,
      abi: erc1155Abi,
      functionName: "isApprovedForAll",
      args: [account.address, spender],
    });

    if (approved) {
      logger.info({ spender }, "CTF approval already set");
      continue;
    }

    logger.info({ spender }, "Approving CTF...");
    const hash = await walletClient.writeContract({
      address: ADDRS.CTF as Address,
      abi: erc1155Abi,
      functionName: "setApprovalForAll",
      args: [spender, true],
      chain: walletClient.chain,
      account: account,
    });
    await publicClient.waitForTransactionReceipt({ hash });
    logger.info({ spender, hash }, "CTF approved");
  }
}

export async function setupApprovals(): Promise<void> {
  logger.info("Setting up on-chain approvals (idempotent)...");
  await ensureErc20Approvals();
  await ensureErc1155Approvals();
  logger.info("All approvals confirmed");
}
