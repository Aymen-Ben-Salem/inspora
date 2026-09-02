type DatabaseIdentity = {
  database: string;
  host: string;
};

function databaseIdentity(value: string, label: string): DatabaseIdentity {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} database URL is invalid.`);
  }

  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error(`${label} database URL must use PostgreSQL.`);
  }

  const host = url.hostname.toLowerCase().replace(/-pooler(?=\.)/, "");
  const database = decodeURIComponent(url.pathname.replace(/^\//, "")).toLowerCase();
  if (!host || !database) {
    throw new Error(`${label} database URL must include a host and database name.`);
  }

  return { database, host };
}

export function assertDevelopmentDatabase(
  developmentUrl: string | undefined,
  productionUrl: string | undefined,
): DatabaseIdentity {
  if (!developmentUrl) {
    throw new Error("Development database URL is required before seeding.");
  }
  if (!productionUrl) {
    throw new Error(
      "Production database URL is required to prove the seed target is separate.",
    );
  }

  const development = databaseIdentity(developmentUrl, "Development");
  const production = databaseIdentity(productionUrl, "Production");
  if (
    development.host === production.host &&
    development.database === production.database
  ) {
    throw new Error(
      "Refusing to seed the production database. Configure a distinct development endpoint.",
    );
  }

  return development;
}
