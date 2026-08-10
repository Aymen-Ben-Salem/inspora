import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "dotenv";

const production = process.argv.slice(2).includes("--production");
config({
  path: production ? ".env.production.local" : ".env.local",
  override: production,
  quiet: true,
});

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET_NAME;

if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  throw new Error(
    `Set the R2 ${production ? "production" : "development"} variables before bootstrapping FFmpeg.`,
  );
}
if (production && bucket !== "inspora-media-production") {
  throw new Error("Production bootstrap requires the inspora-media-production bucket.");
}

const client = new S3Client({
  region: "auto",
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  requestChecksumCalculation: "WHEN_REQUIRED",
  credentials: { accessKeyId, secretAccessKey },
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
        Bucket: bucket,
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
