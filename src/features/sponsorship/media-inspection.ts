import "server-only";
import sharp from "sharp";
import { hasExpectedFileSignature } from "@/storage/private-submissions";
import {
  ACCEPTED_MEDIA_MIME_TYPES,
  getMediaUploadLimit,
} from "@/features/media/upload-policy";
import type { SponsorAssetKind } from "./types";

function mp4Dimensions(bytes: Uint8Array) {
  const b = Buffer.from(bytes);
  function boxes(
    start: number,
    end: number,
    depth = 0,
  ): Array<{ type: string; start: number; end: number }> {
    if (depth > 5) throw new Error("Invalid video container.");
    const result = [];
    let pos = start;
    while (pos + 8 <= end && result.length < 10000) {
      let size = b.readUInt32BE(pos),
        header = 8;
      if (size === 1) {
        if (pos + 16 > end) break;
        size = Number(b.readBigUInt64BE(pos + 8));
        header = 16;
      }
      if (size === 0) size = end - pos;
      if (!Number.isSafeInteger(size) || size < header || pos + size > end)
        throw new Error("Invalid video container.");
      result.push({
        type: b.toString("ascii", pos + 4, pos + 8),
        start: pos + header,
        end: pos + size,
      });
      pos += size;
    }
    return result;
  }
  const moov = boxes(0, b.length).find((x) => x.type === "moov");
  if (!moov) throw new Error("Video metadata is missing.");
  for (const track of boxes(moov.start, moov.end).filter(
    (x) => x.type === "trak",
  )) {
    const parts = boxes(track.start, track.end),
      tkhd = parts.find((x) => x.type === "tkhd"),
      mdia = parts.find((x) => x.type === "mdia");
    if (!tkhd || !mdia) continue;
    const hdlr = boxes(mdia.start, mdia.end).find((x) => x.type === "hdlr");
    if (
      !hdlr ||
      hdlr.end - hdlr.start < 12 ||
      b.toString("ascii", hdlr.start + 8, hdlr.start + 12) !== "vide"
    )
      continue;
    const offset = tkhd.start + (b[tkhd.start] === 1 ? 88 : 76);
    if (offset + 8 <= tkhd.end)
      return {
        width: b.readUInt32BE(offset) / 65536,
        height: b.readUInt32BE(offset + 4) / 65536,
      };
  }
  throw new Error("Video dimensions are missing.");
}
function webmDimensions(bytes: Uint8Array) {
  const masters = new Set([0x1a45dfa3, 0x18538067, 0x1654ae6b, 0xae, 0xe0]);
  let visited = 0;
  function vint(pos: number, id: boolean) {
    const first = bytes[pos];
    if (!first) throw new Error("Invalid WebM.");
    let size = 1,
      mask = 128;
    while (!(first & mask) && size <= 8) {
      size++;
      mask >>= 1;
    }
    if (size > (id ? 4 : 8) || pos + size > bytes.length)
      throw new Error("Invalid WebM.");
    let value = id ? first : first & (mask - 1);
    for (let i = 1; i < size; i++) value = value * 256 + bytes[pos + i];
    return { value, size, unknown: !id && value === Math.pow(2, 7 * size) - 1 };
  }
  function scan(
    start: number,
    end: number,
    depth: number,
  ): { width?: number; height?: number; type?: number } {
    if (depth > 8) throw new Error("Invalid WebM nesting.");
    const dimensions: { width?: number; height?: number; type?: number } = {};
    for (let p = start; p < end;) {
      if (++visited > 10000) throw new Error("WebM metadata is too complex.");
      const id = vint(p, true),
        length = vint(p + id.size, false),
        data = p + id.size + length.size;
      const next = length.unknown ? end : data + length.value;
      if (next > end || next < data || !Number.isSafeInteger(next))
        throw new Error("Invalid WebM size.");
      if (masters.has(id.value)) {
        const child = scan(data, next, depth + 1);
        if (
          id.value === 0xae &&
          child.type === 1 &&
          child.width &&
          child.height
        )
          return child;
        if (id.value !== 0xae) Object.assign(dimensions, child);
      } else if ([0xb0, 0xba, 0x83].includes(id.value) && length.value <= 4) {
        let n = 0;
        for (let i = data; i < next; i++) n = n * 256 + bytes[i];
        dimensions[
          id.value === 0xb0 ? "width" : id.value === 0xba ? "height" : "type"
        ] = n;
      }
      p = next;
    }
    return dimensions;
  }
  const d = scan(0, bytes.length, 0);
  if (!d.width || !d.height) throw new Error("Video dimensions are missing.");
  return { width: d.width, height: d.height };
}
export async function inspectSponsorMedia(
  bytes: Uint8Array,
  contentType: string,
  kind: SponsorAssetKind,
) {
  const mime = ACCEPTED_MEDIA_MIME_TYPES.find((x) => x === contentType);
  if (
    !mime ||
    !bytes.length ||
    bytes.length > getMediaUploadLimit(mime) ||
    !hasExpectedFileSignature(mime, bytes)
  )
    throw new Error("Unsupported, oversized or invalid media.");
  if (
    kind !== "original" &&
    kind !== "media" &&
    kind !== "video-preview" &&
    !mime.startsWith("image/")
  )
    throw new Error("Brand and poster assets must be static raster images.");
  let dimensions: { width: number; height: number };
  if (mime.startsWith("image/")) {
    const m = await sharp(bytes, {
      animated: true,
      limitInputPixels: 40000000,
    }).metadata();
    if (
      !m.width ||
      !m.height ||
      (kind !== "original" && kind !== "media" && (m.pages ?? 1) !== 1)
    )
      throw new Error("Use a valid static raster image.");
    dimensions = { width: m.width, height: m.pageHeight ?? m.height };
  } else
    dimensions =
      mime === "video/mp4" ? mp4Dimensions(bytes) : webmDimensions(bytes);
  if (
    !Number.isInteger(dimensions.width) ||
    !Number.isInteger(dimensions.height) ||
    dimensions.width < 1 ||
    dimensions.height < 1 ||
    dimensions.width > 16384 ||
    dimensions.height > 16384
  )
    throw new Error("Invalid media dimensions.");
  if (
    kind === "video-preview" &&
    (mime !== "video/mp4" ||
      dimensions.width > 1080 ||
      dimensions.height > 1920)
  )
    throw new Error("Use a valid MP4 feed preview up to 1080 × 1920.");
  return dimensions;
}
