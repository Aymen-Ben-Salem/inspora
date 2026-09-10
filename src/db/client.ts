import "server-only";

import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";

import {
  assertDataOperationEnvironment,
  runtimeDataEnvironmentFromValues,
} from "../../scripts/lib/environment-fingerprint";
import * as schema from "./schema";

export type Database = NeonHttpDatabase<typeof schema>;

export class DatabaseConfigurationError extends Error {
  constructor() {
    super("DATABASE_URL is not configured.");
    this.name = "DatabaseConfigurationError";
  }
}

let cachedDatabase: Database | null | undefined;

export function getDatabase(): Database | null {
  if (cachedDatabase !== undefined) return cachedDatabase;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    cachedDatabase = null;
    return cachedDatabase;
  }

  assertDataOperationEnvironment(runtimeDataEnvironmentFromValues(process.env));

  const client = neon(connectionString);
  cachedDatabase = drizzle({ client, schema });
  return cachedDatabase;
}

export function requireDatabase(): Database {
  const database = getDatabase();

  if (!database) throw new DatabaseConfigurationError();

  return database;
}
