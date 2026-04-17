import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { getEnv } from "../config/index.js";
import * as schema from "./schema.js";
import { logger } from "../logger.js";

let _db: NodePgDatabase<typeof schema> | null = null;
let _pool: pg.Pool | null = null;

export function getDb(): NodePgDatabase<typeof schema> {
  if (_db) return _db;
  const env = getEnv();
  _pool = new pg.Pool({ connectionString: env.POSTGRES_URL });
  _db = drizzle(_pool, { schema });
  logger.info("Postgres connection pool initialized");
  return _db;
}

export async function closeDb(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
    _db = null;
    logger.info("Postgres connection pool closed");
  }
}
