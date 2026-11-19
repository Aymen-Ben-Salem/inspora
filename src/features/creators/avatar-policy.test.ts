import { expect, it } from "vitest";
import { assertCreatorAvatarDimensions, CREATOR_AVATAR_SOFT_NOTICE, creatorAvatarSoftNotice } from "./avatar-policy";

it("rejects only photos whose shorter side is under 256 pixels", () => {
  expect(() => assertCreatorAvatarDimensions(255, 1200)).toThrow("256 × 256");
  expect(() => assertCreatorAvatarDimensions(Number.NaN, 600)).toThrow("256 × 256");
  expect(() => assertCreatorAvatarDimensions(256, 256)).not.toThrow();
});

it("softly notes stored avatars below the 400 pixel recommendation", () => {
  expect(creatorAvatarSoftNotice(256)).toBe(CREATOR_AVATAR_SOFT_NOTICE);
  expect(creatorAvatarSoftNotice(399)).toBe(CREATOR_AVATAR_SOFT_NOTICE);
  expect(creatorAvatarSoftNotice(400)).toBeNull();
  expect(creatorAvatarSoftNotice(512)).toBeNull();
  expect(creatorAvatarSoftNotice(undefined)).toBeNull();
});
