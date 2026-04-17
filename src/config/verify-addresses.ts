import { ADDRS, GEOBLOCK_URL } from "./addresses.js";
import { logger } from "../logger.js";

export async function verifyGeoblock(): Promise<void> {
  const res = await fetch(GEOBLOCK_URL);
  if (!res.ok) {
    throw new Error(`Geoblock check failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as { blocked?: boolean };
  if (body.blocked) {
    throw new Error(
      "Bot is running from a geo-blocked IP. Aborting. Use a non-blocked VPS.",
    );
  }
  logger.info("Geoblock check passed");
}

export async function verifyContractAddresses(): Promise<void> {
  const expected: Record<string, string> = {
    CTF_EXCHANGE: ADDRS.CTF_EXCHANGE,
    NEG_RISK_EXCHANGE: ADDRS.NEG_RISK_EXCHANGE,
    NEG_RISK_ADAPTER: ADDRS.NEG_RISK_ADAPTER,
    CTF: ADDRS.CTF,
    USDCE: ADDRS.USDCE,
  };

  logger.info(
    { addresses: expected },
    "Contract addresses loaded — verify against docs.polymarket.com/resources/contract-addresses at startup",
  );

  // In production, this would fetch and parse the docs page.
  // For now, log the addresses so the operator can verify.
  for (const [name, addr] of Object.entries(expected)) {
    logger.info(`  ${name}: ${addr}`);
  }
}
