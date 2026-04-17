import { z } from "zod";

const envSchema = z.object({
  POLYGON_RPC_URL: z.string().url(),
  POLYMARKET_PK: z.string().startsWith("0x"),
  POLYMARKET_FUNDER: z.string().startsWith("0x"),
  POLYMARKET_API_KEY: z.string().min(1),
  POLYMARKET_API_SECRET: z.string().min(1),
  POLYMARKET_API_PASSPHRASE: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  ASKNEWS_CLIENT_ID: z.string().min(1),
  ASKNEWS_CLIENT_SECRET: z.string().min(1),
  POSTGRES_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  OPS_WEBHOOK_URL: z.string().url().optional(),
  DASHBOARD_PORT: z.coerce.number().int().default(3141),
  MAX_CAPITAL_USDC: z.coerce.number().positive().default(5000),
  DRY_RUN: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function loadEnv(): Env {
  if (_env) return _env;
  _env = envSchema.parse(process.env);
  return _env;
}

export function getEnv(): Env {
  if (!_env) throw new Error("env not loaded — call loadEnv() first");
  return _env;
}
