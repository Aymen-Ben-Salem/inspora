import {
  VIDEO_PREVIEW_MAX_HEIGHT,
  VIDEO_PREVIEW_MAX_WIDTH,
} from "./video-preview-validation";

export {
  VIDEO_PREVIEW_MAX_HEIGHT,
  VIDEO_PREVIEW_MAX_WIDTH,
} from "./video-preview-validation";

type ConverterConfiguration = { coreUrl: string; wasmUrl: string };
type ConversionStage =
  | "loading-converter"
  | "analyzing-gif"
  | "optimizing-animation"
  | "analyzing-video"
  | "optimizing-video";

const CONVERSION_TIMEOUT_MS = 5 * 60 * 1000;
let enginePromise: Promise<import("@ffmpeg/ffmpeg").FFmpeg> | undefined;
let conversionQueue: Promise<void> = Promise.resolve();
let pendingConversions = 0;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

function runConversionExclusive<T>(
  signal: AbortSignal,
  operation: () => Promise<T>,
) {
  pendingConversions++;
  clearTimeout(idleTimer);
  const run = conversionQueue.then(async () => {
    if (signal.aborted) {
      throw new DOMException("Media conversion was cancelled.", "AbortError");
    }
    return operation();
  });
  conversionQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run.finally(() => {
    pendingConversions--;
    if (pendingConversions === 0) {
      // Keep the engine briefly for the GIF -> video-preview sequence, then
      // release its worker and WASM high-water allocation across navigation.
      idleTimer = setTimeout(() => {
        const idleEngine = enginePromise;
        enginePromise = undefined;
        void idleEngine?.then((engine) => engine.terminate(), () => {});
      }, 5000);
    }
  });
}

async function loadEngine(
  configuration: ConverterConfiguration,
  signal: AbortSignal,
) {
  if (!enginePromise) {
    enginePromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);
      const ffmpeg = new FFmpeg();
      const blobs = await Promise.allSettled([
        toBlobURL(configuration.coreUrl, "text/javascript"),
        toBlobURL(configuration.wasmUrl, "application/wasm"),
      ]);
      try {
        signal.throwIfAborted();
        const [core, wasm] = blobs;
        if (core.status === "rejected") throw core.reason;
        if (wasm.status === "rejected") throw wasm.reason;
        await ffmpeg.load({ coreURL: core.value, wasmURL: wasm.value }, { signal });
        return ffmpeg;
      } catch (error) {
        ffmpeg.terminate();
        throw error;
      } finally {
        for (const blob of blobs) if (blob.status === "fulfilled") URL.revokeObjectURL(blob.value);
      }
    })().catch((error) => {
      enginePromise = undefined;
      throw error;
    });
  }
  return enginePromise;
}

async function convertGifToMp4Unlocked({
  file,
  configuration,
  signal,
  onStage,
}: {
  file: File;
  configuration: ConverterConfiguration;
  signal: AbortSignal;
  onStage: (stage: ConversionStage) => void;
}) {
  onStage("loading-converter");
  const ffmpeg = await loadEngine(configuration, signal);
  const token = crypto.randomUUID();
  const inputName = `${token}.gif`;
  const outputName = `${token}.mp4`;

  try {
    onStage("analyzing-gif");
    const { fetchFile } = await import("@ffmpeg/util");
    await ffmpeg.writeFile(inputName, await fetchFile(file), { signal });
    onStage("optimizing-animation");
    const exitCode = await ffmpeg.exec(
      [
        "-i",
        inputName,
        "-an",
        "-vf",
        "fps=30,scale=w='min(1920\\,iw)':h='min(1920\\,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-tune",
        "animation",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputName,
      ],
      CONVERSION_TIMEOUT_MS,
      { signal },
    );
    if (exitCode !== 0) throw new Error("GIF optimization did not complete in time.");

    const data = await ffmpeg.readFile(outputName, "binary", { signal });
    if (!(data instanceof Uint8Array) || data.byteLength === 0) {
      throw new Error("GIF optimization produced an invalid video.");
    }
    const bytes = Uint8Array.from(data);
    return new File([bytes.buffer], `${file.name.replace(/\.gif$/i, "")}.mp4`, {
      type: "video/mp4",
    });
  } catch (error) {
    if (signal.aborted) {
      ffmpeg.terminate();
      enginePromise = undefined;
      throw new DOMException("GIF conversion was cancelled.", "AbortError");
    }
    ffmpeg.terminate();
    enginePromise = undefined;
    throw new Error(
      "This GIF could not be optimized in the browser. Try a smaller GIF or convert it to MP4 externally.",
      { cause: error },
    );
  } finally {
    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch {}
  }
}

export function convertGifToMp4(
  input: Parameters<typeof convertGifToMp4Unlocked>[0],
) {
  return runConversionExclusive(input.signal, () => convertGifToMp4Unlocked(input));
}
export function buildVideoPreviewFfmpegArgs(
  inputName: string,
  outputName: string,
) {
  return [
    "-i",
    inputName,
    "-an",
    "-vf",
    `fps=30,scale=w='min(${VIDEO_PREVIEW_MAX_WIDTH}\\,iw)':h='min(${VIDEO_PREVIEW_MAX_HEIGHT}\\,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1`,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-fpsmax",
    "30",
    "-movflags",
    "+faststart",
    outputName,
  ];
}

async function createVideoPreviewUnlocked({
  file,
  configuration,
  signal,
  onStage,
}: {
  file: File;
  configuration: ConverterConfiguration;
  signal: AbortSignal;
  onStage: (stage: ConversionStage) => void;
}) {
  onStage("loading-converter");
  const ffmpeg = await loadEngine(configuration, signal);
  const token = crypto.randomUUID();
  const inputName = `${token}.${file.type === "video/webm" ? "webm" : "mp4"}`;
  const outputName = `${token}-feed.mp4`;

  try {
    onStage("analyzing-video");
    const { fetchFile } = await import("@ffmpeg/util");
    await ffmpeg.writeFile(inputName, await fetchFile(file), { signal });
    onStage("optimizing-video");
    const exitCode = await ffmpeg.exec(
      buildVideoPreviewFfmpegArgs(inputName, outputName),
      CONVERSION_TIMEOUT_MS,
      { signal },
    );
    if (exitCode !== 0) {
      throw new Error("Feed video transcoding did not complete in time.");
    }

    const data = await ffmpeg.readFile(outputName, "binary", { signal });
    if (!(data instanceof Uint8Array) || data.byteLength === 0) {
      throw new Error("Feed video transcoding produced an invalid video.");
    }

    const bytes = Uint8Array.from(data);
    return new File(
      [bytes.buffer],
      `${file.name.replace(/\.[^.]+$/, "")}-feed.mp4`,
      { type: "video/mp4" },
    );
  } catch (error) {
    ffmpeg.terminate();
    enginePromise = undefined;
    if (signal.aborted) {
      throw new DOMException("Video preview creation was cancelled.", "AbortError");
    }
    throw new Error("This video could not be converted into a feed preview.", {
      cause: error,
    });
  } finally {
    try {
      await ffmpeg.deleteFile(inputName);
      await ffmpeg.deleteFile(outputName);
    } catch {}
  }
}
export function createVideoPreview(
  input: Parameters<typeof createVideoPreviewUnlocked>[0],
) {
  return runConversionExclusive(input.signal, () => createVideoPreviewUnlocked(input));
}
