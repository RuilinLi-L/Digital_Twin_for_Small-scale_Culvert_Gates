import mysql from 'mysql2/promise'
import { attachDatabasePool } from '@vercel/functions'

let pool

export class DatabaseConfigurationError extends Error {}

export function getDatabaseOptions() {
  const required = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE']
  if (required.some(key => !process.env[key])) {
    throw new DatabaseConfigurationError('Database environment is incomplete')
  }
  const port = Number(process.env.MYSQL_PORT || 3306)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new DatabaseConfigurationError('Invalid database port')
  }
  const local = ['127.0.0.1', 'localhost', '::1'].includes(process.env.MYSQL_HOST)
  const disableTls = process.env.MYSQL_SSL === 'false'
  if (disableTls && (!local || process.env.VERCEL)) {
    throw new DatabaseConfigurationError('TLS may only be disabled for a local development connection')
  }
  const ca = process.env.MYSQL_SSL_CA_BASE64
    ? Buffer.from(process.env.MYSQL_SSL_CA_BASE64, 'base64').toString('utf8')
    : process.env.MYSQL_SSL_CA?.replace(/\\n/g, '\n')
  if (ca && !ca.includes('-----BEGIN CERTIFICATE-----')) {
    throw new DatabaseConfigurationError('Invalid database CA certificate')
  }
  return {
    host: process.env.MYSQL_HOST,
    port,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    connectTimeout: 5000,
    enableKeepAlive: true,
    ssl: disableTls ? undefined : { rejectUnauthorized: true, verifyIdentity: true,
      minVersion: 'TLSv1.2', ...(ca ? { ca } : {}) }
  }
}

export function getDatabasePool() {
  if (!pool) {
    const created = mysql.createPool({ ...getDatabaseOptions(), connectionLimit: 3,
      maxIdle: 1, idleTimeout: 5000, waitForConnections: true, queueLimit: 20 })
    // The Vercel helper needs mysql2's underlying pool, not its Promise wrapper.
    attachDatabasePool(created.pool)
    pool = created
  }
  return pool
}

export async function closeDatabasePool() {
  if (pool) {
    const current = pool
    pool = undefined
    await current.end()
  }
}
