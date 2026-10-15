import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { AdminMediaPreview } from "./media-preview";

it("uses only the poster for a video library card, without starting video requests", () => {
  const html = renderToStaticMarkup(<AdminMediaPreview type="video" url="/large-original.mp4" posterUrl="/poster.webp" alt="Work" />);
  expect(html).toContain('src="/poster.webp"');
  expect(html).toContain('loading="lazy"');
  expect(html).not.toContain("/large-original.mp4");
  expect(html).not.toContain("<video");
});

it("does not download a video when a library card has no poster", () => {
  const html = renderToStaticMarkup(<AdminMediaPreview type="video" url="/large-original.mp4" />);
  expect(html).not.toContain("/large-original.mp4");
  expect(html).not.toContain("<video");
});

it("keeps playback available in the editor when controls are requested", () => {
  const html = renderToStaticMarkup(<AdminMediaPreview type="video" url="/original.mp4" posterUrl="/poster.webp" controls />);
  expect(html).toContain("<video");
  expect(html).toContain('src="/original.mp4"');
  expect(html).toContain('preload="none"');
  expect(html).toContain("controls");
});
