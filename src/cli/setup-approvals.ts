import { loadEnv } from "../config/index.js";
import { setupApprovals } from "../chain/approvals.js";
import { logger } from "../logger.js";

async function main() {
  loadEnv();
  logger.info("Starting on-chain approval setup...");
  await setupApprovals();
  logger.info("Done.");
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Setup approvals failed");
  process.exit(1);
});
