import { describe, expect, it } from "vitest";
import { buildLosslessVideoCropArgs } from "./video-crop-lossless";

const stream = {
  codec_name: "h264", width: 1720, height: 1080, pix_fmt: "yuvj420p",
  field_order: "progressive", r_frame_rate: "30/1",
};
const headers = [
  "35 chroma_format_idc 010 = 1",
  "59 pic_width_in_mbs_minus1 0000001101100 = 107",
  "72 pic_height_in_map_units_minus1 0000001000100 = 67",
  "85 frame_mbs_only_flag 1 = 1",
  "87 frame_cropping_flag 1 = 1",
  "88 frame_crop_left_offset 1 = 0",
  "89 frame_crop_right_offset 00101 = 4",
  "94 frame_crop_top_offset 1 = 0",
  "95 frame_crop_bottom_offset 00101 = 4",
];
const crop = { x: 2, y: 2, width: 1716, height: 1076 };

describe("lossless H.264 border cropping", () => {
  it("preserves encoded frames and existing padding while cropping picture edges", () => {
    const args = buildLosslessVideoCropArgs("input.mp4", "output.mp4", crop, stream, headers);
    expect(args).toContain("h264_metadata=crop_left=2:crop_right=10:crop_top=2:crop_bottom=10");
    expect(args).toContain("copy");
    expect(args).toContain("+faststart");
    expect(args).not.toContain("-vf");
    expect(args).not.toContain("-t");
  });

  it("adds a second crop to the existing visible origin", () => {
    const previousHeaders = headers.map(line => line.replace("frame_crop_left_offset 1 = 0", "frame_crop_left_offset 010 = 1")
      .replace("frame_crop_top_offset 1 = 0", "frame_crop_top_offset 010 = 1")
      .replace("frame_crop_right_offset 00101 = 4", "frame_crop_right_offset 00110 = 5")
      .replace("frame_crop_bottom_offset 00101 = 4", "frame_crop_bottom_offset 00110 = 5"));
    const args = buildLosslessVideoCropArgs("input.mp4", "output.mp4", { x: 2, y: 2, width: 1712, height: 1072 },
      { ...stream, width: 1716, height: 1076 }, previousHeaders);
    expect(args).toContain("h264_metadata=crop_left=4:crop_right=12:crop_top=4:crop_bottom=12");
  });

  it.each([
    { ...stream, codec_name: "vp9" },
    { ...stream, r_frame_rate: "60/1" },
    { ...stream, r_frame_rate: "0/0" },
    { ...stream, pix_fmt: "yuv420p10le" },
    { ...stream, field_order: "tt" },
    { ...stream, sample_aspect_ratio: "4:3" },
    { ...stream, side_data_list: [{ rotation: 90 }] },
    { ...stream, width: 1700 },
  ])("uses transcoding for unsupported source metadata (%j)", metadata => {
    expect(buildLosslessVideoCropArgs("in", "out", crop, metadata, headers)).toBeNull();
  });

  it("transcodes substantial crops to keep playback decode dimensions bounded", () => {
    expect(buildLosslessVideoCropArgs("in", "out", { x: 0, y: 0, width: 800, height: 600 }, stream, headers)).toBeNull();
  });

  it("counts earlier cropping and codec padding in the playback decode budget", () => {
    const previousHeaders = headers.map(line => line
      .replace("frame_crop_left_offset 1 = 0", "frame_crop_left_offset 00000101001 = 40")
      .replace("frame_crop_right_offset 00101 = 4", "frame_crop_right_offset 00000101001 = 40"));
    expect(buildLosslessVideoCropArgs("in", "out", { x: 0, y: 0, width: 1480, height: 1068 },
      { ...stream, width: 1568 }, previousHeaders)).toBeNull();
  });

  it("rejects missing, conflicting or interlaced sequence headers", () => {
    expect(buildLosslessVideoCropArgs("in", "out", crop, stream, [])).toBeNull();
    expect(buildLosslessVideoCropArgs("in", "out", crop, stream, [...headers, "72 pic_height_in_map_units_minus1 1 = 66"])).toBeNull();
    expect(buildLosslessVideoCropArgs("in", "out", crop, stream, headers.map(line => line.replace("frame_mbs_only_flag 1 = 1", "frame_mbs_only_flag 0 = 0")))).toBeNull();
  });
});
