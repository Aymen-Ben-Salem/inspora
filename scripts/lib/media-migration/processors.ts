import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

import type { MigrationStorage } from "./storage";
import type {
  CloudinarySource,
  CreatorAvatarSnapshot,
  PostMediaSnapshot,
  PreparedMigration,
  PreparedObject,
} from "./types";

const IMAGE_WIDTHS = [640, 960, 1600, 2560] as const;
const PROCESS_TIMEOUT_MS = 10 * 60 * 1000;

function outputWidths(sourceWidth: number, avatar: boolean) {
  const maximum = avatar ? 256 : 2560;
  const outputWidth = Math.min(sourceWidth, maximum);
  if (avatar) return [outputWidth];
  return [...IMAGE_WIDTHS.filter((width) => width < outputWidth), outputWidth];
}

async function runProcess(command: string, args: string[]) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${command} exceeded the ten-minute migration timeout.`));
    }, PROCESS_TIMEOUT_MS);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-16_000);
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(
        error.message.includes("ENOENT")
          ? new Error(`${command} is not installed or is not available on PATH.`)
          : error,
      );
    });
    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with code ${code}: ${stderr}`));
    });
  });
}

async function probeVideo(path: string) {
  const { stdout } = await runProcess("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    path,
  ]);
  const parsed = JSON.parse(stdout) as { streams?: Array<{ width?: number; height?: number }> };
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream.height) {
    throw new Error("ffprobe could not read the optimized video dimensions.");
  }
  return { width: stream.width, height: stream.height };
}

async function prepareImageObjects({
  body,
  prefix,
  avatar,
}: {
  body: Buffer;
  prefix: "posts" | "creators";
  avatar: boolean;
}) {
  const metadata = await sharp(body, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Sharp could not read the source image dimensions.");
  }

  const objects: Array<PreparedObject & { width: number; height: number }> = [];
  for (const width of outputWidths(metadata.width, avatar)) {
    const result = await sharp(body, { failOn: "error" })
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 84, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    const storageKey = `${prefix}/${randomUUID()}.webp`;
    objects.push({
      storageKey,
      body: result.data,
      contentType: "image/webp",
      width: result.info.width,
      height: result.info.height,
    });
  }
  return objects;
}

export async function prepareCreatorAvatarMigration({
  source,
  cloudinary,
  body,
  storage,
}: {
  source: CreatorAvatarSnapshot;
  cloudinary: CloudinarySource;
  body: Buffer;
  storage: MigrationStorage;
}): Promise<PreparedMigration> {
  if (cloudinary.resourceType !== "image" || cloudinary.format === "gif") {
    throw new Error("Creator avatars must be static images.");
  }
  const [primary] = await prepareImageObjects({ body, prefix: "creators", avatar: true });
  if (!primary) throw new Error("Avatar optimization produced no output.");

  return {
    objects: [primary],
    target: {
      ...source,
      avatarUrl: storage.publicUrl(primary.storageKey),
      avatarStorageProvider: "r2",
      avatarStorageKey: primary.storageKey,
    },
  };
}

async function prepareStaticPostImage({
  source,
  body,
  storage,
  sourceMimeType,
}: {
  source: PostMediaSnapshot;
  body: Buffer;
  storage: MigrationStorage;
  sourceMimeType: string;
}): Promise<PreparedMigration> {
  const objects = await prepareImageObjects({ body, prefix: "posts", avatar: false });
  const primary = objects.at(-1);
  if (!primary) throw new Error("Image optimization produced no output.");
  const variants = objects.slice(0, -1).map((object) => ({
    url: storage.publicUrl(object.storageKey),
    storageKey: object.storageKey,
    width: object.width,
    height: object.height,
    bytes: object.body.byteLength,
    format: "webp" as const,
  }));

  return {
    objects,
    target: {
      ...source,
      type: "image",
      url: storage.publicUrl(primary.storageKey),
      posterUrl: null,
      storageProvider: "r2",
      storageKey: primary.storageKey,
      mimeType: "image/webp",
      sourceMimeType,
      sizeBytes: primary.body.byteLength,
      variants,
      posterStorageKey: null,
      width: primary.width,
      height: primary.height,
    },
  };
}

async function prepareVideoPost({
  source,
  cloudinary,
  body,
  storage,
}: {
  source: PostMediaSnapshot;
  cloudinary: CloudinarySource;
  body: Buffer;
  storage: MigrationStorage;
}): Promise<PreparedMigration> {
  const directory = await mkdtemp(join(tmpdir(), "inspora-media-"));
  const safeExtension = /^[a-z0-9]+$/.test(cloudinary.format)
    ? cloudinary.format
    : cloudinary.resourceType === "video"
      ? "mp4"
      : "gif";
  const inputPath = join(directory, `input.${safeExtension}`);
  const outputPath = join(directory, "output.mp4");
  const posterPath = join(directory, "poster.webp");

  try {
    await writeFile(inputPath, body);
    const isGif = cloudinary.mimeType === "image/gif";
    const scaleFilter =
      "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2";
    const videoFilter = isGif ? `fps=30,${scaleFilter}` : scaleFilter;
    await runProcess("ffmpeg", [
      "-y",
      "-i",
      inputPath,
      "-an",
      "-vf",
      videoFilter,
      "-c:v",
      "libx264",
      "-preset",
      isGif ? "veryfast" : "fast",
      ...(isGif ? ["-tune", "animation"] : []),
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      ...(!isGif ? ["-fpsmax", "30"] : []),
      "-movflags",
      "+faststart",
      outputPath,
    ]);
    await runProcess("ffmpeg", [
      "-y",
      "-i",
      outputPath,
      "-frames:v",
      "1",
      "-vf",
      "scale=w='min(1920,iw)':h='min(1920,ih)':force_original_aspect_ratio=decrease",
      "-c:v",
      "libwebp",
      "-quality",
      "84",
      posterPath,
    ]);

    const [videoBody, posterBody, dimensions] = await Promise.all([
      readFile(outputPath),
      readFile(posterPath),
      probeVideo(outputPath),
    ]);
    if (videoBody.byteLength === 0 || posterBody.byteLength === 0) {
      throw new Error("Video optimization produced an empty file.");
    }
    const videoKey = `posts/${randomUUID()}.mp4`;
    const posterKey = `posts/${randomUUID()}.webp`;
    const objects: PreparedObject[] = [
      { storageKey: videoKey, body: videoBody, contentType: "video/mp4" },
      { storageKey: posterKey, body: posterBody, contentType: "image/webp" },
    ];

    return {
      objects,
      target: {
        ...source,
        type: "video",
        url: storage.publicUrl(videoKey),
        posterUrl: storage.publicUrl(posterKey),
        storageProvider: "r2",
        storageKey: videoKey,
        mimeType: "video/mp4",
        sourceMimeType: cloudinary.mimeType,
        sizeBytes: videoBody.byteLength,
        variants: [],
        posterStorageKey: posterKey,
        width: dimensions.width,
        height: dimensions.height,
      },
    };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function preparePostMediaMigration({
  source,
  cloudinary,
  body,
  storage,
}: {
  source: PostMediaSnapshot;
  cloudinary: CloudinarySource;
  body: Buffer;
  storage: MigrationStorage;
}) {
  if (cloudinary.resourceType === "video" || cloudinary.mimeType === "image/gif") {
    return prepareVideoPost({ source, cloudinary, body, storage });
  }
  return prepareStaticPostImage({
    source,
    body,
    storage,
    sourceMimeType: cloudinary.mimeType,
  });
}
