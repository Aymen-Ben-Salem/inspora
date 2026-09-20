import { createHash } from "node:crypto";

export type FingerprintedEnvironment = {
  dataEnvironment: string;
  databaseUrl: string;
  databaseUrlUnpooled: string;
  r2BucketName: string;
  r2PublicBaseUrl: string;
  r2SubmissionsBucketName?: string;
};

export type EnvironmentFingerprint = {
  dataEnvironment: "development" | "preview";
  neonEndpointSha256: string;
  r2BucketSha256: string;
  publicMediaHostSha256: string;
  privateSubmissionsBucketSha256?: string;
};

export function runtimeDataEnvironmentFromValues(
  values: Record<string, string | undefined>,
): FingerprintedEnvironment {
  const databaseUrl = values.DATABASE_URL ?? "";

  return {
    dataEnvironment: values.DATA_ENVIRONMENT ?? "",
    databaseUrl,
    databaseUrlUnpooled: values.DATABASE_URL_UNPOOLED ?? databaseUrl,
    r2BucketName: values.R2_BUCKET_NAME ?? "",
    r2PublicBaseUrl: values.R2_PUBLIC_BASE_URL ?? "",
    r2SubmissionsBucketName: values.R2_SUBMISSIONS_BUCKET_NAME ?? "",
  };
}

export const APPROVED_ENVIRONMENT_FINGERPRINTS = {
  development: {
    dataEnvironment: "development",
    neonEndpointSha256:
      "f2d1ae74f9e2713e9b729231a5d1a0ae8a81ee417802969fedfa015022a78fc3",
    r2BucketSha256:
      "5accfe99b5b0dfe7314976b3748d52851fa9bd2a5ea6eebc130d7670eab56788",
    publicMediaHostSha256:
      "363255622e000ec651fe794f470bc64bba234f158b00d9f7231de3ae3f460cce",
    privateSubmissionsBucketSha256:
      "e8e1f6af2be20e0237ddb370baef664106229ff78b579b6f3cafae51a99bd0e7",
  },
  preview: {
    dataEnvironment: "preview",
    neonEndpointSha256:
      "faa06d2291fc30bee3a7524e27fcb8d91eb50bc5cad95ab414d39fbb50cc7a77",
    r2BucketSha256:
      "37326831e2bf5dde2302fde06ffba466f489a1907994d99e10ab9aeb078798da",
    publicMediaHostSha256:
      "52f771a6481ead658a267c94899c3b5eabc58db8053fb2fa57c844e32698845e",
    privateSubmissionsBucketSha256:
      "211d9ee9927fc3b75275b927e5d19defe7933348be302ec3479a1ee39e9fb8f5",
  },
} as const satisfies Record<"development" | "preview", EnvironmentFingerprint>;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function unverifiable(field: string): never {
  throw new Error(`${field} fingerprint could not be verified.`);
}

function neonEndpoint(value: string, field: string) {
  if (!value.trim()) return unverifiable(field);

  try {
    const url = new URL(value);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname.toLowerCase().endsWith(".neon.tech")
    ) {
      return unverifiable(field);
    }
    return url.hostname.toLowerCase().replace(/-pooler(?=\.)/, "");
  } catch {
    return unverifiable(field);
  }
}

function publicMediaHost(value: string) {
  if (!value.trim()) return unverifiable("Public media host");

  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      (url.pathname !== "/" && url.pathname !== "") ||
      url.search ||
      url.hash
    ) {
      return unverifiable("Public media host");
    }
    return url.hostname.toLowerCase();
  } catch {
    return unverifiable("Public media host");
  }
}

function assertHash(field: string, value: string, expectedSha256: string) {
  if (!value.trim()) return unverifiable(field);
  if (sha256(value) !== expectedSha256) {
    throw new Error(`${field} fingerprint does not match the approved destination.`);
  }
}

export function assertEnvironmentFingerprint(
  environment: FingerprintedEnvironment,
  expected: EnvironmentFingerprint,
) {
  if (!environment.dataEnvironment.trim()) {
    return unverifiable("DATA_ENVIRONMENT");
  }
  if (environment.dataEnvironment !== expected.dataEnvironment) {
    throw new Error(
      "DATA_ENVIRONMENT fingerprint does not match the approved destination.",
    );
  }

  const pooledEndpoint = neonEndpoint(environment.databaseUrl, "Neon endpoint");
  const directEndpoint = neonEndpoint(
    environment.databaseUrlUnpooled,
    "Neon endpoint",
  );
  if (pooledEndpoint !== directEndpoint) {
    throw new Error("Neon endpoint fingerprint does not match the approved destination.");
  }
  assertHash("Neon endpoint", pooledEndpoint, expected.neonEndpointSha256);
  assertHash("R2 bucket", environment.r2BucketName.trim(), expected.r2BucketSha256);
  assertHash(
    "Public media host",
    publicMediaHost(environment.r2PublicBaseUrl),
    expected.publicMediaHostSha256,
  );
  if (expected.privateSubmissionsBucketSha256) {
    assertHash(
      "Private submissions bucket",
      environment.r2SubmissionsBucketName?.trim() ?? "",
      expected.privateSubmissionsBucketSha256,
    );
  }
}

export function assertDataOperationEnvironment(
  environment: FingerprintedEnvironment,
  options: {
    approvedFingerprints?: Record<
      "development" | "preview",
      EnvironmentFingerprint
    >;
    nodeEnvironment?: string;
    vercelEnvironment?: string;
  } = {},
) {
  if (
    environment.dataEnvironment === "development" ||
    environment.dataEnvironment === "preview"
  ) {
    const approved =
      options.approvedFingerprints ?? APPROVED_ENVIRONMENT_FINGERPRINTS;
    assertEnvironmentFingerprint(
      environment,
      approved[environment.dataEnvironment],
    );
    return;
  }

  if (environment.dataEnvironment === "production") {
    const nodeEnvironment = options.nodeEnvironment ?? process.env.NODE_ENV;
    const vercelEnvironment = options.vercelEnvironment ?? process.env.VERCEL_ENV;
    if (nodeEnvironment === "production" && vercelEnvironment === "production") {
      return;
    }
    throw new Error("Production data operations require a production deployment.");
  }

  return unverifiable("DATA_ENVIRONMENT");
}
