import { checkServerIdentity } from "node:tls";
import { isIP } from "node:net";

/**
 * Parse connection details explicitly so URI parameters cannot override TLS or
 * redirect the connection after the local-only TLS exception has been checked.
 * @param {NodeJS.ProcessEnv} environment
 * @returns {import("pg").PoolConfig}
 */
export function getDatabaseConfig(environment = process.env) {
  const connectionString = environment.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required");

  let url;
  try { url = new URL(connectionString); }
  catch { throw new Error("DATABASE_URL must be a PostgreSQL URL"); }
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  const database = decodeURIComponent(url.pathname.slice(1));
  const user = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);
  const port = url.port ? Number(url.port) : 5432;
  if (!host || !database || database.includes("/") || !user || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DATABASE_URL is missing valid connection details");
  }

  const sslMode = environment.HANZHA_DB_SSL?.trim();
  if (sslMode && sslMode !== "verify-full" && sslMode !== "disable") {
    throw new Error("HANZHA_DB_SSL must be verify-full or disable");
  }
  const disableTls = sslMode === "disable";
  if (disableTls && (environment.VERCEL || !["localhost", "127.0.0.1", "::1"].includes(host))) {
    throw new Error("Disabling database TLS is permitted only for local development");
  }

  return {
    host,
    port,
    database,
    user,
    password,
    ssl: disableTls ? false : {
      rejectUnauthorized: true,
      ...(isIP(host) ? {} : { servername: host }),
      checkServerIdentity: (_servername, certificate) => checkServerIdentity(host, certificate),
    },
    enableChannelBinding: !disableTls,
    max: 3,
    min: 0,
    idleTimeoutMillis: 5000,
    connectionTimeoutMillis: 10000,
    query_timeout: 12000,
    application_name: "hanzha-vercel",
  };
}
