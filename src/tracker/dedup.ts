import { getRedis } from "../persist/redis.js";

const DEDUP_TTL_SEC = 24 * 60 * 60;
const DEDUP_PREFIX = "signal:seen:";

export async function markSeen(transactionHash: string): Promise<boolean> {
  const redis = getRedis();
  const key = `${DEDUP_PREFIX}${transactionHash}`;
  const result = await redis.set(key, "1", "EX", DEDUP_TTL_SEC, "NX");
  return result === "OK";
}

export async function isSeen(transactionHash: string): Promise<boolean> {
  const redis = getRedis();
  return (await redis.exists(`${DEDUP_PREFIX}${transactionHash}`)) > 0;
}
