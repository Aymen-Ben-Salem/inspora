import "server-only";

import { Pool } from "@neondatabase/serverless";
import { drizzle, type NeonDatabase } from "drizzle-orm/neon-serverless";

import {
  assertDataOperationEnvironment,
  runtimeDataEnvironmentFromValues,
} from "../../scripts/lib/environment-fingerprint";
import { DatabaseConfigurationError } from "./client";
import * as schema from "./schema";

type WriteDatabase = NeonDatabase<typeof schema>;

export type WriteTx = Parameters<
  Parameters<WriteDatabase["transaction"]>[0]
>[0];

export async function withWriteTransaction<T>(
  work: (tx: WriteTx) => Promise<T>,
): Promise<T> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new DatabaseConfigurationError();

  assertDataOperationEnvironment(runtimeDataEnvironmentFromValues(process.env));

  const pool = new Pool({ connectionString });
  const client = await pool.connect();

  try {
    const database = drizzle(client, { schema });
    return await database.transaction(work);
  } finally {
    client.release();
    await pool.end();
  }
}
