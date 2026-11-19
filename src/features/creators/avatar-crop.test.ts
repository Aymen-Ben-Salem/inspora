import { describe, expect, it } from "vitest";
import {
  avatarCropFromView,
  centeredAvatarCrop,
  clampAvatarView,
  initialAvatarView,
  isValidAvatarCrop,
  maxAvatarZoom,
  panAvatarView,
  zoomAvatarView,
} from "./avatar-crop";

const landscape = { width: 1200, height: 800 };

describe("avatar crop geometry", () => {
  it("starts with the largest centred square", () => {
    expect(centeredAvatarCrop(landscape)).toEqual({ x: 200, y: 0, size: 800 });
    expect(centeredAvatarCrop({ width: 400, height: 900 })).toEqual({ x: 0, y: 250, size: 400 });
  });

  it("never zooms the crop below the minimum avatar size", () => {
    expect(maxAvatarZoom({ width: 256, height: 900 })).toBe(1);
    expect(maxAvatarZoom({ width: 512, height: 512 })).toBe(2);
    expect(maxAvatarZoom({ width: 4000, height: 3000 })).toBe(4);
    const crop = avatarCropFromView(landscape, zoomAvatarView(landscape, initialAvatarView(landscape), 99));
    expect(crop.size).toBeGreaterThanOrEqual(256);
    expect(isValidAvatarCrop(landscape, crop)).toBe(true);
  });

  it("keeps the crop inside the photo while panning", () => {
    const view = panAvatarView(landscape, initialAvatarView(landscape), 5000, -5000);
    expect(avatarCropFromView(landscape, view)).toEqual({ x: 400, y: 0, size: 800 });
    const zoomed = panAvatarView(landscape, zoomAvatarView(landscape, initialAvatarView(landscape), 2), -5000, 5000);
    expect(avatarCropFromView(landscape, zoomed)).toEqual({ x: 0, y: 400, size: 400 });
  });

  it("repairs non-finite input instead of producing an invalid crop", () => {
    const view = clampAvatarView(landscape, { zoom: Number.NaN, centerX: Number.NaN, centerY: Infinity });
    expect(isValidAvatarCrop(landscape, avatarCropFromView(landscape, view))).toBe(true);
  });

  it("rejects crops outside the photo or below the minimum", () => {
    expect(isValidAvatarCrop(landscape, { x: 500, y: 0, size: 800 })).toBe(false);
    expect(isValidAvatarCrop(landscape, { x: 0, y: 0, size: 255 })).toBe(false);
    expect(isValidAvatarCrop(landscape, { x: 0.5, y: 0, size: 400 })).toBe(false);
    expect(isValidAvatarCrop(landscape, { x: 0, y: 0, size: 400 })).toBe(true);
  });
});
