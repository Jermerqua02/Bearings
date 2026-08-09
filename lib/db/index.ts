/* ————————————————————————————————————————
   Database connection.

   One postgres.js client per process. Next.js dev reloads modules on every
   edit, so the client is cached on globalThis to avoid opening a new pool
   per reload and exhausting connections.
   ———————————————————————————————————————— */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.",
  );
}

const globalForDb = globalThis as unknown as {
  client: ReturnType<typeof postgres> | undefined;
};

const client =
  globalForDb.client ??
  postgres(connectionString, {
    max: 10,
    // Railway terminates idle connections; keep the pool honest.
    idle_timeout: 20,
    connect_timeout: 10,
  });

if (process.env.NODE_ENV !== "production") globalForDb.client = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
