import { Pool } from "pg";
import { attachDatabasePool } from "@vercel/functions";
import { getDatabaseConfig } from "./database-config.mjs";

let databasePool: Pool | undefined;

export function getDatabasePool(): Pool {
  if (databasePool) return databasePool;

  const pool = new Pool(getDatabaseConfig());
  pool.on("error", () => {
    console.error("[database] An idle connection was closed");
  });
  attachDatabasePool(pool);
  databasePool = pool;
  return pool;
}
