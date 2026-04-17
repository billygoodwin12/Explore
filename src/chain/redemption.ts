import { type Address, parseAbi } from "viem";
import { ADDRS } from "../config/addresses.js";
import { getPublicClient, getWalletClient, getAccount } from "./client.js";
import { logger } from "../logger.js";

const ctfAbi = parseAbi([
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

const exchangeAbi = parseAbi([
  "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)",
]);

const negRiskAdapterAbi = parseAbi([
  "function redeemPositions(bytes32 conditionId, uint256[] amounts)",
]);

export async function redeemPosition(
  conditionId: `0x${string}`,
  negRisk: boolean,
  tokenIds: bigint[],
): Promise<string | null> {
  const publicClient = getPublicClient();
  const walletClient = getWalletClient();
  const account = getAccount();

  const balances = await Promise.all(
    tokenIds.map((id) =>
      publicClient.readContract({
        address: ADDRS.CTF as Address,
        abi: ctfAbi,
        functionName: "balanceOf",
        args: [account.address, id],
      }),
    ),
  );

  const minBalance = balances.reduce((a, b) => (a < b ? a : b), balances[0]!);
  if (minBalance === 0n) {
    logger.info({ conditionId }, "No redeemable balance");
    return null;
  }

  let hash: `0x${string}`;

  if (negRisk) {
    const amounts = balances.map(() => minBalance);
    hash = await walletClient.writeContract({
      address: ADDRS.NEG_RISK_ADAPTER as Address,
      abi: negRiskAdapterAbi,
      functionName: "redeemPositions",
      args: [conditionId, amounts],
      chain: walletClient.chain,
      account,
    });
  } else {
    const indexSets = tokenIds.map((_, i) => BigInt(1 << i));
    hash = await walletClient.writeContract({
      address: ADDRS.CTF_EXCHANGE as Address,
      abi: exchangeAbi,
      functionName: "redeemPositions",
      args: [
        ADDRS.USDCE as Address,
        "0x0000000000000000000000000000000000000000000000000000000000000000",
        conditionId,
        indexSets,
      ],
      chain: walletClient.chain,
      account,
    });
  }

  await publicClient.waitForTransactionReceipt({ hash });
  logger.info({ conditionId, hash, amount: minBalance.toString() }, "Redeemed");
  return hash;
}
