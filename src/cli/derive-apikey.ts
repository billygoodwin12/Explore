import { loadEnv, getEnv } from "../config/index.js";
import { deriveL2Credentials } from "../clob/auth.js";
import { logger } from "../logger.js";

async function main() {
  loadEnv();
  const env = getEnv();
  logger.info("Deriving L2 API credentials...");
  const creds = await deriveL2Credentials(env.POLYMARKET_PK);
  logger.info("L2 credentials derived. Store these securely:");
  logger.info(`  API Key:    ${creds.apiKey}`);
  logger.info(`  Secret:     ${creds.secret}`);
  logger.info(`  Passphrase: ${creds.passphrase}`);
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, "Derive API key failed");
  process.exit(1);
});
