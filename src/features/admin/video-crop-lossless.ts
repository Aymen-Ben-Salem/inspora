import type { VideoCrop } from "./video-crop";

export type VideoCropStream = {
  codec_type?: string;
  codec_name?: string;
  duration?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  field_order?: string;
  r_frame_rate?: string;
  sample_aspect_ratio?: string;
  side_data_list?: Array<{ rotation?: number }>;
};

// Remuxing can add a small MP4 header even when all encoded frames are copied.
export const VIDEO_CROP_REMUX_OVERHEAD_BYTES = 64 * 1024;

export function canLosslesslyCropVideo(stream: VideoCropStream, crop: VideoCrop) {
  const { width = 0, height = 0 } = stream;
  const [numerator, denominator] = (stream.r_frame_rate ?? "").split("/").map(Number);
  const frameRate = numerator / denominator;
  return stream.codec_name === "h264" &&
    (stream.pix_fmt === "yuv420p" || stream.pix_fmt === "yuvj420p") &&
    stream.field_order === "progressive" &&
    (!stream.sample_aspect_ratio || stream.sample_aspect_ratio === "1:1" || stream.sample_aspect_ratio === "0:1") &&
    !stream.side_data_list?.some(data => data.rotation) &&
    Number.isFinite(frameRate) && frameRate > 0 && frameRate <= 30 &&
    Number.isInteger(width) && Number.isInteger(height) &&
    crop.x >= 0 && crop.y >= 0 && crop.width > 0 && crop.height > 0 &&
    [crop.x, crop.y, crop.width, crop.height].every(value => Number.isInteger(value) && value % 2 === 0) &&
    crop.x + crop.width <= width && crop.y + crop.height <= height &&
    // A metadata crop still decodes the coded picture. Transcode larger crops
    // so their playback cost shrinks with the visible image.
    crop.width * crop.height >= width * height * 0.9;
}

export function buildLosslessVideoCropArgs(
  input: string,
  output: string,
  crop: VideoCrop,
  stream: VideoCropStream,
  headers: string[],
) {
  if (!canLosslesslyCropVideo(stream, crop)) return null;
  const values = new Map<string, number>();
  for (const line of headers) {
    const match = line.match(/\b(chroma_format_idc|separate_colour_plane_flag|bit_depth_luma_minus8|bit_depth_chroma_minus8|pic_width_in_mbs_minus1|pic_height_in_map_units_minus1|frame_mbs_only_flag|frame_cropping_flag|frame_crop_(?:left|right|top|bottom)_offset)\s+\S+\s+=\s+(\d+)\s*$/);
    if (!match) continue;
    const [, name, rawValue] = match;
    const value = Number(rawValue);
    if (values.has(name) && values.get(name) !== value) return null;
    values.set(name, value);
  }
  if ((values.get("chroma_format_idc") ?? 1) !== 1 ||
    (values.get("separate_colour_plane_flag") ?? 0) !== 0 ||
    (values.get("bit_depth_luma_minus8") ?? 0) !== 0 ||
    (values.get("bit_depth_chroma_minus8") ?? 0) !== 0 ||
    values.get("frame_mbs_only_flag") !== 1 || !values.has("frame_cropping_flag")) return null;

  const codedWidth = ((values.get("pic_width_in_mbs_minus1") ?? NaN) + 1) * 16;
  const codedHeight = ((values.get("pic_height_in_map_units_minus1") ?? NaN) + 1) * 16;
  const edge = (name: string) => values.get("frame_cropping_flag")
    ? (values.get(`frame_crop_${name}_offset`) ?? NaN) * 2
    : 0;
  const left = edge("left");
  const top = edge("top");
  if (codedWidth - left - edge("right") !== stream.width ||
    codedHeight - top - edge("bottom") !== stream.height ||
    crop.width * crop.height < codedWidth * codedHeight * 0.9) return null;

  const filter = `h264_metadata=crop_left=${left + crop.x}:crop_right=${codedWidth - left - crop.x - crop.width}:crop_top=${top + crop.y}:crop_bottom=${codedHeight - top - crop.y - crop.height}`;
  return [
    "-i", input, "-map", "0:v:0", "-map", "0:a:0?", "-c", "copy",
    "-bsf:v", filter, "-movflags", "+faststart", output,
  ];
}
