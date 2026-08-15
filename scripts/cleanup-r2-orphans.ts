import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import { creators, postMedia } from "../src/db/schema";
import {
  loadProductionMediaEnvironment,
  parseExecutionOptions,
  type ProductionMediaEnvironment,
} from "./lib/production-environment";

const MANAGED_PREFIXES = ["posts/", "creators/"];

function createR2Client(environment: ProductionMediaEnvironment) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${environment.r2AccountId}.r2.cloudflarestorage.com`,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: {
      accessKeyId: environment.r2AccessKeyId,
      secretAccessKey: environment.r2SecretAccessKey,
    },
  });
}

async function listManagedObjects(
  client: S3Client,
  environment: ProductionMediaEnvironment,
) {
  const objects: Array<{ key: string; lastModified: Date | null }> = [];

  for (const prefix of MANAGED_PREFIXES) {
    let continuationToken: string | undefined;
    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: environment.r2BucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      objects.push(
        ...(response.Contents ?? []).flatMap((object) =>
          object.Key
            ? [{ key: object.Key, lastModified: object.LastModified ?? null }]
            : [],
        ),
      );
      continuationToken = response.IsTruncated
        ? response.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }

  return objects;
}

async function referencedR2Keys(environment: ProductionMediaEnvironment) {
  const database = drizzle({ client: neon(environment.databaseUrl) });
  const [mediaRows, creatorRows] = await Promise.all([
    database
      .select({
        storageKey: postMedia.storageKey,
        posterStorageKey: postMedia.posterStorageKey,
        variants: postMedia.variants,
      })
      .from(postMedia)
      .where(eq(postMedia.storageProvider, "r2")),
    database
      .select({ storageKey: creators.avatarStorageKey })
      .from(creators)
      .where(eq(creators.avatarStorageProvider, "r2")),
  ]);

  return new Set(
    [
      ...mediaRows.flatMap((row) => [
        row.storageKey,
        row.posterStorageKey,
        ...row.variants.map((variant) => variant.storageKey),
      ]),
      ...creatorRows.map((row) => row.storageKey),
    ].filter((value): value is string => Boolean(value)),
  );
}

async function cleanupR2Orphans() {
  const environment = loadProductionMediaEnvironment();
  const options = parseExecutionOptions();
  const client = createR2Client(environment);
  const [stored, referenced] = await Promise.all([
    listManagedObjects(client, environment),
    referencedR2Keys(environment),
  ]);
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  const allOrphans = stored
    .filter(
      (object) =>
        !referenced.has(object.key) &&
        object.lastModified !== null &&
        object.lastModified.getTime() < cutoff,
    )
    .map((object) => object.key);
  const orphans = options.limit ? allOrphans.slice(0, options.limit) : allOrphans;

  console.log(
    `${options.execute ? "Executing" : "Dry run:"} ${orphans.length} of ${allOrphans.length} R2 orphan(s).`,
  );
  for (const key of orphans) console.log(`- ${key}`);

  if (!options.execute || orphans.length === 0) return;

  for (let index = 0; index < orphans.length; index += 1000) {
    const keys = orphans.slice(index, index + 1000);
    const response = await client.send(
      new DeleteObjectsCommand({
        Bucket: environment.r2BucketName,
        Delete: { Quiet: true, Objects: keys.map((Key) => ({ Key })) },
      }),
    );
    if (response.Errors?.length) {
      throw new Error(`R2 failed to delete ${response.Errors.length} object(s).`);
    }
  }
}

cleanupR2Orphans().catch((error) => {
  console.error("R2 orphan cleanup failed.", error);
  process.exitCode = 1;
});
