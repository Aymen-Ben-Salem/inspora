import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { loadDevelopmentMediaEnvironment } from "./lib/development-environment";

if (process.argv.slice(2).includes("--production")) {
  throw new Error("Production R2 bootstrap is outside the development workflow.");
}

const environment = loadDevelopmentMediaEnvironment();

const client = new S3Client({
  region: "auto",
  endpoint: `https://${environment.r2AccountId}.r2.cloudflarestorage.com`,
  requestChecksumCalculation: "WHEN_REQUIRED",
  credentials: {
    accessKeyId: environment.r2AccessKeyId,
    secretAccessKey: environment.r2SecretAccessKey,
  },
});
const files = [
  { name: "ffmpeg-core.js", contentType: "text/javascript; charset=utf-8" },
  { name: "ffmpeg-core.wasm", contentType: "application/wasm" },
] as const;

async function main() {
  for (const file of files) {
    const body = await readFile(
      join(process.cwd(), "node_modules", "@ffmpeg", "core", "dist", "umd", file.name),
    );
    await client.send(
      new PutObjectCommand({
        Bucket: environment.r2BucketName,
        Key: `system/ffmpeg/0.12.10/${file.name}`,
        Body: body,
        ContentType: file.contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
    console.log(`Uploaded ${file.name} (${body.byteLength} bytes).`);
  }
}

main().catch((error) => {
  console.error("R2 FFmpeg bootstrap failed.", error);
  process.exitCode = 1;
});
