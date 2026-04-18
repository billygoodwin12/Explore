import { loadEnv } from "../config/index.js";
import { removeWallet } from "../tracker/universe.js";
import { closeDb } from "../persist/db.js";
import { closeRedis } from "../persist/redis.js";
import { logger } from "../logger.js";

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  let address = "";
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--address") address = args[++i]!;
  }
  if (!address) {
    logger.error("Usage: pnpm run remove-wallet -- --address 0x...");
    process.exit(1);
  }
  await removeWallet(address);
  logger.info({ address }, "Wallet removed (status = PAUSED)");
  await closeDb();
  await closeRedis();
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Remove wallet failed");
  process.exit(1);
});
