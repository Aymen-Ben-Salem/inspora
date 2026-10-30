import { expect, it } from "vitest";
import { creatorAvatarUrl } from "./avatar-image-url";

it("uses the larger variant of the same X profile image", () => {
  expect(creatorAvatarUrl("https://pbs.twimg.com/profile_images/123/portrait_normal.jpg?tag=1"))
    .toBe("https://pbs.twimg.com/profile_images/123/portrait_400x400.jpg?tag=1");
});

it.each([
  "/brand/default-avatar.svg",
  "https://media.example/creators/photo_normal.webp",
  "https://pbs.twimg.com/media/photo_normal.jpg",
  "https://pbs.twimg.com/profile_images/123/portrait_400x400.jpg",
  "https://img.clerk.com/custom-avatar",
])("preserves custom uploads, other providers and already-large images: %s", value => {
  expect(creatorAvatarUrl(value)).toBe(value);
});
