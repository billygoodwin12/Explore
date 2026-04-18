import { type Address, parseAbi } from "viem";
import { ADDRS } from "../config/addresses.js";
import { getPublicClient, getAccount } from "../chain/client.js";
import { fetchWalletPositions } from "../data/positions.js";
import { getRedis, REDIS_CHANNELS } from "../persist/redis.js";
import { logger } from "../logger.js";

const ctfAbi = parseAbi([
  "function balanceOf(address account, uint256 id) view returns (uint256)",
]);

const DRIFT_ALERT_THRESHOLD = 1;

export interface ReconcileResult {
  tokenId: string;
  onChainBalance: bigint;
  apiBalance: number;
  drift: number;
  alert: boolean;
}

export async function reconcilePositions(
  tokenIds: string[],
): Promise<ReconcileResult[]> {
  const publicClient = getPublicClient();
  const account = getAccount();

  const apiPositions = await fetchWalletPositions(account.address);
  const apiByAsset = new Map(apiPositions.map((p) => [p.asset, p]));

  const results: ReconcileResult[] = [];

  for (const tokenId of tokenIds) {
    const onChainBalance = await publicClient.readContract({
      address: ADDRS.CTF as Address,
      abi: ctfAbi,
      functionName: "balanceOf",
      args: [account.address, BigInt(tokenId)],
    });

    const apiPos = apiByAsset.get(tokenId);
    const apiBalance = apiPos?.size ?? 0;
    const onChainShares = Number(onChainBalance) / 1_000_000;
    const drift = Math.abs(onChainShares - apiBalance);
    const alert = drift > DRIFT_ALERT_THRESHOLD;

    results.push({
      tokenId,
      onChainBalance,
      apiBalance,
      drift,
      alert,
    });

    if (alert) {
      logger.error(
        { tokenId, onChainShares, apiBalance, drift },
        "Position drift detected!",
      );

      const redis = getRedis();
      await redis.publish(
        REDIS_CHANNELS.RISK,
        JSON.stringify({
          type: "POSITION_DRIFT",
          tokenId,
          onChainShares,
          apiBalance,
          drift,
          timestamp: Date.now(),
        }),
      );
    }
  }

  logger.info(
    { count: results.length, alerts: results.filter((r) => r.alert).length },
    "Reconciliation complete",
  );

  return results;
}
