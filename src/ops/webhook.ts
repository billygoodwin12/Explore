import { getEnv } from "../config/index.js";
import { logger } from "../logger.js";

export async function sendOpsAlert(message: string, data?: unknown): Promise<void> {
  const env = getEnv();
  if (!env.OPS_WEBHOOK_URL) return;

  try {
    await fetch(env.OPS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: message,
        data,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (err) {
    logger.error({ err }, "Failed to send ops alert");
  }
}
