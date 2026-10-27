import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { getDatabaseConfig } from "../lib/server/database-config.mjs";

let pool;
let client;

try {
  try {
    process.loadEnvFile(new URL("../.env.local", import.meta.url));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const environment = {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL,
  };
  pool = new Pool({ ...getDatabaseConfig(environment), max: 1 });
  pool.on("error", () => {
    console.error("Database connection closed during initialization.");
  });
  const schema = await readFile(new URL("./schema.sql", import.meta.url), "utf8");
  client = await pool.connect();
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('hanzha_repair_records_schema_v1'))");
  await client.query(schema);
  await client.query("COMMIT");
  console.log("Database schema initialized. Existing repair records were preserved.");
} catch {
  if (client) await client.query("ROLLBACK").catch(() => undefined);
  console.error("Database initialization failed. Check connection settings, TLS, and schema permissions.");
  process.exitCode = 1;
} finally {
  client?.release();
  await pool?.end();
}
