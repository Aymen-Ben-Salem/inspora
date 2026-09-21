import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

export type R2ClientConfiguration = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
};

const R2_HOST_SUFFIX = ".r2.cloudflarestorage.com";
const CLOUDFLARE_ACCOUNT_ID = /^[0-9a-f]{32}$/i;

export function r2Endpoint(value: string) {
  const input = value.trim();
  if (CLOUDFLARE_ACCOUNT_ID.test(input)) {
    return `https://${input.toLowerCase()}${R2_HOST_SUFFIX}`;
  }

  let endpoint: URL;
  try {
    endpoint = new URL(input.includes("://") ? input : `https://${input}`);
  } catch {
    throw new Error("R2 account endpoint is invalid.");
  }

  const accountId = endpoint.hostname
    .toLowerCase()
    .endsWith(R2_HOST_SUFFIX)
    ? endpoint.hostname.slice(0, -R2_HOST_SUFFIX.length)
    : "";
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port ||
    (endpoint.pathname !== "/" && endpoint.pathname !== "") ||
    endpoint.search ||
    endpoint.hash ||
    !CLOUDFLARE_ACCOUNT_ID.test(accountId)
  ) {
    throw new Error("R2 account endpoint is invalid.");
  }

  return `https://${accountId.toLowerCase()}${R2_HOST_SUFFIX}`;
}

export function createR2Client(configuration: R2ClientConfiguration) {
  return new S3Client({
    region: "auto",
    requestChecksumCalculation: "WHEN_REQUIRED",
    endpoint: r2Endpoint(configuration.accountId),
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
  });
}
