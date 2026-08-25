import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { promisify } from "node:util";

import {
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { neon } from "@neondatabase/serverless";
import { and, desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import { postMedia, posts, sponsors } from "../src/db/schema";
import { buildVideoPreviewFfmpegArgs } from "../src/features/admin/gif-conversion";
import type { VideoPreview } from "../src/storage/types";
import {
  loadDevelopmentMediaEnvironment,
  parseDevelopmentExecutionOptions,
} from "./lib/development-environment";
import {
  buildDevelopmentPreviewStorageKey,
  partitionVideoPreviewsBySource,
  type RunnableVideoPreviewCandidate,
  type VideoPreviewCandidate,
} from "./lib/video-preview-migration";

const execFileAsync = promisify(execFile);
const CACHE_CONTROL = "public, max-age=31536000, immutable";

function createR2Client(environment: ReturnType<typeof loadDevelopmentMediaEnvironment>) {
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

function publicUrl(baseUrl: string, storageKey: string) {
  const encoded = storageKey.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/${encoded}`;
}

async function videoDimensions(path: string) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      path,
    ],
    { timeout: 60_000, windowsHide: true },
  );
  const parsed: unknown = JSON.parse(stdout);
  const stream =
    parsed && typeof parsed === "object" && "streams" in parsed
      ? (parsed as { streams?: Array<{ width?: unknown; height?: unknown }> }).streams?.[0]
      : undefined;
  if (
    typeof stream?.width !== "number" ||
    typeof stream.height !== "number" ||
    stream.width <= 0 ||
    stream.height <= 0 ||
    stream.width > 1080 ||
    stream.height > 1920
  ) {
    throw new Error("FFmpeg produced an invalid or oversized feed preview.");
  }
  return { width: stream.width, height: stream.height };
}

async function discoverCandidates(
  database: ReturnType<typeof drizzle>,
): Promise<VideoPreviewCandidate[]> {
  const [postRows, sponsorRows] = await Promise.all([
    database
      .select({
        id: postMedia.id,
        sourceStorageKey: postMedia.storageKey,
        sourceUrl: postMedia.url,
        preview: postMedia.videoPreview,
      })
      .from(postMedia)
      .innerJoin(posts, eq(postMedia.postId, posts.id))
      .where(
        and(
          eq(postMedia.type, "video"),
          eq(postMedia.storageProvider, "r2"),
          eq(postMedia.position, 0),
        ),
      )
      .orderBy(desc(posts.createdAt)),
    database
      .select({
        id: sponsors.id,
        sourceStorageKey: sponsors.mediaStorageKey,
        sourceUrl: sponsors.mediaUrl,
        preview: sponsors.mediaVideoPreview,
      })
      .from(sponsors)
      .where(
        and(
          eq(sponsors.mediaType, "video"),
          eq(sponsors.mediaStorageProvider, "r2"),
        ),
      ),
  ]);

  return [
    ...postRows.flatMap((row) =>
      row.sourceStorageKey && row.sourceUrl
        ? [{ id: row.id, sourceStorageKey: row.sourceStorageKey, sourceUrl: row.sourceUrl, preview: row.preview, resourceType: "post_media" as const }]
        : [],
    ),
    ...sponsorRows.flatMap((row) =>
      row.sourceStorageKey && row.sourceUrl
        ? [{ id: row.id, sourceStorageKey: row.sourceStorageKey, sourceUrl: row.sourceUrl, preview: row.preview, resourceType: "sponsor" as const }]
        : [],
    ),
  ];
}

async function listDevelopmentStorageKeys(
  client: S3Client,
  environment: ReturnType<typeof loadDevelopmentMediaEnvironment>,
) {
  const keys = new Set<string>();
  for (const prefix of ["posts/", "sponsors/"]) {
    let continuationToken: string | undefined;
    do {
      const page = await client.send(
        new ListObjectsV2Command({
          Bucket: environment.r2BucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const object of page.Contents ?? []) {
        if (object.Key) keys.add(object.Key);
      }
      continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (continuationToken);
  }
  return keys;
}

async function savePreview(
  database: ReturnType<typeof drizzle>,
  candidate: VideoPreviewCandidate,
  preview: VideoPreview,
) {
  if (candidate.resourceType === "post_media") {
    return database
      .update(postMedia)
      .set({ videoPreview: preview })
      .where(and(eq(postMedia.id, candidate.id), isNull(postMedia.videoPreview)))
      .returning({ id: postMedia.id });
  }

  return database
    .update(sponsors)
    .set({ mediaVideoPreview: preview, updatedAt: new Date() })
    .where(and(eq(sponsors.id, candidate.id), isNull(sponsors.mediaVideoPreview)))
    .returning({ id: sponsors.id });
}

async function transcodeCandidate({
  candidate,
  client,
  database,
  environment,
  allowedPublicSourceHosts,
  tempRoot,
}: {
  candidate: RunnableVideoPreviewCandidate;
  client: S3Client;
  database: ReturnType<typeof drizzle>;
  environment: ReturnType<typeof loadDevelopmentMediaEnvironment>;
  allowedPublicSourceHosts: ReadonlySet<string>;
  tempRoot: string;
}) {
  let sourceBytes: Uint8Array;
  let sourcePath: string;

  if (candidate.sourceKind === "development-r2") {
    const source = await client.send(
      new GetObjectCommand({
        Bucket: environment.r2BucketName,
        Key: candidate.sourceStorageKey,
      }),
    );
    if (!source.Body) throw new Error("R2 returned an empty original video.");
    sourceBytes = await source.Body.transformToByteArray();
    sourcePath = candidate.sourceStorageKey;
  } else {
    const response = await fetch(candidate.sourceUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(10 * 60_000),
    });
    if (!response.ok) {
      throw new Error(`Source download failed with HTTP ${response.status}.`);
    }
    const finalUrl = new URL(response.url);
    if (
      finalUrl.protocol !== "https:" ||
      !allowedPublicSourceHosts.has(finalUrl.hostname)
    ) {
      throw new Error("Source download redirected to an untrusted host.");
    }
    sourceBytes = new Uint8Array(await response.arrayBuffer());
    sourcePath = finalUrl.pathname;
  }
  if (sourceBytes.length === 0) throw new Error("Source video was empty.");

  const sourceExtension = [".mp4", ".webm"].includes(
    extname(sourcePath).toLowerCase(),
  )
    ? extname(sourcePath).toLowerCase()
    : ".mp4";
  const inputPath = join(tempRoot, `${candidate.id}-original${sourceExtension}`);
  const outputPath = join(tempRoot, `${candidate.id}-feed.mp4`);
  await writeFile(inputPath, sourceBytes);

  await execFileAsync(
    "ffmpeg",
    ["-y", ...buildVideoPreviewFfmpegArgs(inputPath, outputPath)],
    { timeout: 10 * 60_000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
  );

  const [{ width, height }, outputStats, body] = await Promise.all([
    videoDimensions(outputPath),
    stat(outputPath),
    readFile(outputPath),
  ]);
  if (outputStats.size <= 0) throw new Error("FFmpeg produced an empty feed preview.");

  const storageKey = buildDevelopmentPreviewStorageKey(candidate);
  await client.send(
    new PutObjectCommand({
      Bucket: environment.r2BucketName,
      Key: storageKey,
      Body: body,
      ContentType: "video/mp4",
      CacheControl: CACHE_CONTROL,
    }),
  );
  const uploaded = await client.send(
    new HeadObjectCommand({ Bucket: environment.r2BucketName, Key: storageKey }),
  );
  if (
    uploaded.ContentLength !== outputStats.size ||
    uploaded.ContentType?.split(";", 1)[0] !== "video/mp4"
  ) {
    throw new Error("The uploaded feed preview could not be verified.");
  }

  const preview: VideoPreview = {
    url: publicUrl(environment.r2PublicBaseUrl, storageKey),
    storageKey,
    width,
    height,
    bytes: outputStats.size,
    format: "mp4",
  };
  const saved = await savePreview(database, candidate, preview);
  if (saved.length === 0) {
    console.log(`Skipped ${candidate.resourceType}:${candidate.id}; another run completed it.`);
    return;
  }
  console.log(
    `Created ${candidate.resourceType}:${candidate.id} -> ${storageKey} (${width}x${height}, ${outputStats.size} bytes).`,
  );
}

async function main() {
  const environment = loadDevelopmentMediaEnvironment();
  const options = parseDevelopmentExecutionOptions();
  const database = drizzle({ client: neon(environment.databaseUrlUnpooled) });
  const client = createR2Client(environment);
  const candidates = await discoverCandidates(database);
  const availableStorageKeys = await listDevelopmentStorageKeys(client, environment);
  const allowedPublicSourceHosts = new Set([
    new URL(environment.r2PublicBaseUrl).hostname,
    "media.inspora.design",
  ]);
  const partitioned = partitionVideoPreviewsBySource(
    candidates,
    availableStorageKeys,
    allowedPublicSourceHosts,
    options.limit,
  );
  const runnableCandidates = partitioned.available;

  console.log(
    `${options.execute ? "Executing" : "Dry run:"} ${runnableCandidates.length} development video preview(s).`,
  );
  console.log(`Database host: ${new URL(environment.databaseUrlUnpooled).hostname}`);
  console.log(`R2 bucket: ${environment.r2BucketName}`);
  if (partitioned.missing.length > 0) {
    console.warn(
      `Skipped ${partitioned.missing.length} row(s) without a trusted readable source.`,
    );
    for (const candidate of partitioned.missing.slice(0, 5)) {
      console.warn(
        `- missing ${candidate.resourceType}:${candidate.id} ${candidate.sourceStorageKey}`,
      );
    }
  }
  for (const candidate of runnableCandidates) {
    console.log(
      `- ${candidate.resourceType}:${candidate.id} source=${candidate.sourceKind === "development-r2" ? "dev-r2" : new URL(candidate.sourceUrl).hostname + " (read-only)"} -> ${buildDevelopmentPreviewStorageKey(candidate)}`,
    );
  }

  if (!options.execute || runnableCandidates.length === 0) return;
  const tempRoot = await mkdtemp(join(tmpdir(), "inspora-dev-video-previews-"));
  let failures = 0;
  let nextCandidateIndex = 0;
  const workerCount = Math.min(2, runnableCandidates.length);
  try {
    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (nextCandidateIndex < runnableCandidates.length) {
          const candidate = runnableCandidates[nextCandidateIndex++];
          if (!candidate) return;
          try {
            await transcodeCandidate({
              candidate,
              client,
              database,
              environment,
              allowedPublicSourceHosts,
              tempRoot,
            });
          } catch (error) {
            failures += 1;
            console.error(
              `Failed ${candidate.resourceType}:${candidate.id}. The original was not modified.`,
              error,
            );
          }
        }
      }),
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }

  if (failures > 0) {
    throw new Error(`${failures} development video preview(s) failed.`);
  }
}

main().catch((error) => {
  console.error("Development video preview migration failed.", error);
  process.exitCode = 1;
});
