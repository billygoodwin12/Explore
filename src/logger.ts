import pino from "pino";

function resolvePrettyTransport(): pino.TransportSingleOptions | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  try {
    require.resolve("pino-pretty");
    return { target: "pino-pretty", options: { colorize: true } };
  } catch {
    return undefined;
  }
}

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "POLYMARKET_PK",
    "POLYMARKET_API_SECRET",
    "POLYMARKET_API_PASSPHRASE",
    "ANTHROPIC_API_KEY",
    "ASKNEWS_CLIENT_SECRET",
    "POSTGRES_URL",
  ],
  transport: resolvePrettyTransport(),
});
