/**
 * Shared PostgreSQL connection pool
 *
 * All application modules should use this single pool instead of creating
 * their own. This prevents connection exhaustion — previously 4 independent
 * pools each requested max 20 connections against a server with max_connections=20.
 *
 * @module lib/db
 */

import { Pool, PoolClient, QueryResult } from "pg"
import { baseLogger } from "./logger"
import { onShutdown } from "./shutdown"

const logger = baseLogger.child({ module: "shared-pool" })

let pool: Pool | null = null

/**
 * Get the shared PostgreSQL connection pool (singleton).
 *
 * Creates the pool on first call with config from environment variables.
 * Max pool size is set to 15 to stay well within PostgreSQL's max_connections=30.
 */
export function getSharedPool(): Pool {
  if (!pool) {
    const config = process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.POSTGRES_HOST || "localhost",
          port: parseInt(process.env.POSTGRES_PORT || "5432", 10),
          database: process.env.POSTGRES_DB || "blinkpos",
          user: process.env.POSTGRES_USER || "blinkpos",
          password: process.env.POSTGRES_PASSWORD || "blinkpos_dev_password",
        }

    pool = new Pool({
      ...config,
      max: 15,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    })

    pool.on("error", (err: Error) => {
      logger.error({ err }, "Unexpected error on idle client")
    })

    logger.info("PostgreSQL pool created (max: 15)")

    // Register with coordinated shutdown handler
    onShutdown("SharedPool", closePool)
  }
  return pool
}

/**
 * Execute a query using the shared pool with slow-query logging.
 */
export async function query(
  text: string,
  params?: unknown[],
): Promise<QueryResult<Record<string, unknown>>> {
  const start = Date.now()
  const result = await getSharedPool().query(text, params)
  const duration = Date.now() - start

  if (duration > 1000) {
    logger.warn({ duration, query: text.substring(0, 100) }, "Slow query detected")
  }

  return result
}

/**
 * Get a dedicated client from the shared pool (for transactions).
 * Caller MUST call client.release() when done.
 */
export async function getClient(): Promise<PoolClient> {
  return getSharedPool().connect()
}

/**
 * Gracefully close the shared pool. Called during shutdown.
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
    console.log("[SharedPool] PostgreSQL pool closed") // Keep console for shutdown path
  }
}
