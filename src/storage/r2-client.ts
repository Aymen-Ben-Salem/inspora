import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

export type R2ClientConfiguration = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
};

export function createR2Client(configuration: R2ClientConfiguration) {
  return new S3Client({
    region: "auto",
    requestChecksumCalculation: "WHEN_REQUIRED",
    endpoint: `https://${configuration.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: configuration.accessKeyId,
      secretAccessKey: configuration.secretAccessKey,
    },
  });
}
