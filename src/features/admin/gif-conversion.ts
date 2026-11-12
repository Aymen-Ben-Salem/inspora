import {
  VIDEO_PREVIEW_MAX_HEIGHT,
  VIDEO_PREVIEW_MAX_WIDTH,
} from "./video-preview-validation";
import type { VideoCrop } from "./video-crop";
import { buildVideoCropFfmpegArgs, packetDuration, videoCropEncodingBudget } from "./video-crop-encoding";
import { MAX_VIDEO_UPLOAD_BYTES } from "../media/upload-policy";
import {
  buildLosslessVideoCropArgs,
  canLosslesslyCropVideo,
  VIDEO_CROP_REMUX_OVERHEAD_BYTES,
  type VideoCropStream,
} from "./video-crop-lossless";

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
  | "cropping-video"
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

async function cropVideoUnlocked({ file, crop, configuration, signal, onStage }: Parameters<typeof createVideoPreviewUnlocked>[0] & { crop: VideoCrop }) {
  onStage("loading-converter");
  const ffmpeg = await loadEngine(configuration, signal);
  const token = crypto.randomUUID();
  const inputName = `${token}.${file.type === "video/webm" ? "webm" : "mp4"}`;
  const metadataNames: string[] = [];
  const outputName = `${token}-cropped.mp4`;
  try {
    onStage("analyzing-video");
    const { fetchFile } = await import("@ffmpeg/util");
    await ffmpeg.writeFile(inputName, await fetchFile(file), { signal });
    const probe = async (entries: string) => {
      const metadataName = `${token}-metadata-${metadataNames.length}.json`;
      metadataNames.push(metadataName);
      const code = await ffmpeg.ffprobe(["-v", "error", "-show_entries", entries, "-of", "json", "-o", metadataName, inputName], CONVERSION_TIMEOUT_MS, { signal });
      signal.throwIfAborted();
      // The installed core 0.12.10 leaves ret at -1 after successful ffprobe.
      // Require fresh, parseable output as well as rejecting explicit errors.
      if (code !== 0 && code !== -1) throw new Error("The recording metadata could not be read.");
      const data = await ffmpeg.readFile(metadataName, "utf8", { signal });
      return JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data));
    };
    const metadata = await probe("format=duration:stream=codec_type,codec_name,duration,width,height,pix_fmt,field_order,r_frame_rate,sample_aspect_ratio:stream_side_data=rotation");
    const streams: VideoCropStream[] = metadata.streams ?? [];
    const videoStream = streams.find((stream) => stream.codec_type === "video");
    if (!videoStream) throw new Error("The recording has no video stream.");
    const audioStream = streams.find((stream) => stream.codec_type === "audio");
    if (canLosslesslyCropVideo(videoStream, crop) && (!audioStream || audioStream.codec_name === "aac")) {
      const headers: string[] = [];
      const onLog = ({ message }: { message: string }) => {
        if (/\b(?:chroma_format_idc|separate_colour_plane_flag|bit_depth_|pic_width_in_|pic_height_in_|frame_mbs_only_flag|frame_cropping_flag|frame_crop_)/.test(message)) headers.push(message);
      };
      ffmpeg.on("log", onLog);
      let traceCode: number;
      try {
        traceCode = await ffmpeg.exec([
          "-loglevel", "info", "-i", inputName, "-map", "0:v:0", "-an", "-c:v", "copy",
          "-bsf:v", "trace_headers", "-f", "null", "-",
        ], CONVERSION_TIMEOUT_MS, { signal });
      } finally {
        ffmpeg.off("log", onLog);
      }
      signal.throwIfAborted();
      const losslessArgs = traceCode === 0
        ? buildLosslessVideoCropArgs(inputName, outputName, crop, videoStream, headers)
        : null;
      if (losslessArgs) {
        onStage("cropping-video");
        const code = await ffmpeg.exec(losslessArgs, CONVERSION_TIMEOUT_MS, { signal });
        signal.throwIfAborted();
        if (code === 0) {
          const data = await ffmpeg.readFile(outputName, "binary", { signal });
          if (data instanceof Uint8Array && data.byteLength > 0 && data.byteLength <= Math.min(MAX_VIDEO_UPLOAD_BYTES, file.size + VIDEO_CROP_REMUX_OVERHEAD_BYTES)) {
            const bytes = Uint8Array.from(data);
            return new File([bytes.buffer], `${file.name.replace(/\.[^.]+$/, "")}-cropped.mp4`, { type: "video/mp4" });
          }
        }
      }
    }
    let duration = Number(metadata.format?.duration);
    if (!Number.isFinite(duration) || duration <= 0) {
      duration = Math.max(0, ...streams.map((stream) => Number(stream.duration) || 0));
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      // Browser-recorded WebM files can omit duration. Read packet timestamps
      // in the same worker rather than opening another browser video decoder.
      const packets = await probe("packet=pts_time,dts_time,duration_time");
      duration = packetDuration(packets.packets ?? []);
    }
    let budget = videoCropEncodingBudget(file.size, duration, streams.some((stream) => stream.codec_type === "audio"));
    onStage("cropping-video");
    for (let attempt = 0; attempt < 2; attempt++) {
      signal.throwIfAborted();
      const code = await ffmpeg.exec(buildVideoCropFfmpegArgs(inputName, outputName, crop, budget), CONVERSION_TIMEOUT_MS, { signal });
      if (code !== 0) throw new Error("Crop encoding did not complete in time.");
      const data = await ffmpeg.readFile(outputName, "binary", { signal });
      if (!(data instanceof Uint8Array) || !data.byteLength) throw new Error("Crop encoding produced an invalid video.");
      if (data.byteLength <= file.size) {
        const bytes = Uint8Array.from(data);
        return new File([bytes.buffer], `${file.name.replace(/\.[^.]+$/, "")}-cropped.mp4`, { type: "video/mp4" });
      }
      const ratio = file.size / data.byteLength * 0.8;
      budget = {
        videoBitrate: Math.max(1000, Math.floor(budget.videoBitrate * ratio)),
        audioBitrate: budget.audioBitrate ? Math.max(1000, Math.floor(budget.audioBitrate * ratio)) : 0,
      };
    }
    throw new Error("The cropped recording could not fit within the original file size. No upload was made.");
  } catch (error) {
    ffmpeg.terminate();
    enginePromise = undefined;
    if (signal.aborted) throw new DOMException("Video cropping was cancelled.", "AbortError");
    throw error;
  } finally {
    for (const name of [inputName, outputName, ...metadataNames]) {
      try { await ffmpeg.deleteFile(name); } catch {}
    }
  }
}

export function cropVideo(input: Parameters<typeof cropVideoUnlocked>[0]) {
  return runConversionExclusive(input.signal, () => cropVideoUnlocked(input));
}
