import { loadEnv } from "../config/index.js";
import { addWallet } from "../tracker/universe.js";
import { closeDb } from "../persist/db.js";
import { closeRedis } from "../persist/redis.js";
import { logger } from "../logger.js";

function parseArgs(): { address: string; multiplier: number } {
  const args = process.argv.slice(2);
  let address = "";
  let multiplier = 1.0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--address") address = args[++i]!;
    else if (args[i] === "--multiplier") multiplier = parseFloat(args[++i]!);
  }
  if (!address) {
    logger.error("Usage: pnpm run add-wallet -- --address 0x... [--multiplier 1.5]");
    process.exit(1);
  }
  return { address, multiplier };
}

async function main() {
  loadEnv();
  const { address, multiplier } = parseArgs();
  await addWallet(address, multiplier);
  logger.info({ address, multiplier }, "Wallet added to followed set");
  await closeDb();
  await closeRedis();
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Add wallet failed");
  process.exit(1);
});
