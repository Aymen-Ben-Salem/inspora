import { videoCropFilter, type VideoCrop } from "./video-crop";

export type CropEncodingBudget = { videoBitrate: number; audioBitrate: number };

export function videoCropEncodingBudget(sourceBytes: number, duration: number, hasAudio: boolean): CropEncodingBudget {
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes <= 0 || !Number.isFinite(duration) || duration <= 0) {
    throw new Error("The recording size and duration could not be read.");
  }
  // Reserve space for MP4 headers, audio framing, and the encoder's rate buffer.
  const payloadBytes = sourceBytes * 0.9 - 8192;
  const totalBitrate = Math.floor(payloadBytes * 8 / (duration + 0.5));
  const audioBitrate = hasAudio ? Math.min(128000, Math.max(16000, Math.floor(totalBitrate * 0.15))) : 0;
  const videoBitrate = totalBitrate - audioBitrate;
  if (videoBitrate < 1000) throw new Error("This recording is too small to fit a new MP4 without increasing its size.");
  return { videoBitrate, audioBitrate };
}

export function buildVideoCropFfmpegArgs(input: string, output: string, crop: VideoCrop, budget: CropEncodingBudget) {
  if (!Number.isSafeInteger(budget.videoBitrate) || budget.videoBitrate < 1000 || !Number.isSafeInteger(budget.audioBitrate) || budget.audioBitrate < 0) {
    throw new Error("The crop encoding budget is invalid.");
  }
  return [
    "-i", input,
    "-map", "0:v:0",
    ...(budget.audioBitrate ? ["-map", "0:a:0?", "-c:a", "aac", "-b:a", String(budget.audioBitrate)] : ["-an"]),
    "-vf", `${videoCropFilter(crop)},fps=30,setsar=1`,
    "-c:v", "libx264", "-preset", "superfast",
    "-b:v", String(budget.videoBitrate),
    "-maxrate", String(budget.videoBitrate),
    "-bufsize", String(Math.ceil(budget.videoBitrate / 2)),
    "-pix_fmt", "yuv420p", "-fpsmax", "30", "-movflags", "+faststart", output,
  ];
}

export function packetDuration(packets: Array<{ pts_time?: string; dts_time?: string; duration_time?: string }>) {
  let start = Infinity;
  let end = -Infinity;
  for (const packet of packets) {
    const time = Number(packet.pts_time ?? packet.dts_time);
    if (!Number.isFinite(time)) continue;
    const length = Number(packet.duration_time);
    start = Math.min(start, time);
    end = Math.max(end, time + (Number.isFinite(length) && length > 0 ? length : 0));
  }
  return end - start;
}
