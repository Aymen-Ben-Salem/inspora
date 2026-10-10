import { expect, it, vi } from "vitest";
import sharp from "sharp";
vi.mock("server-only", () => ({}));
import { prepareWebsiteSuggestion } from "./suggestion-images";
const drawing = (content: string, root = 'viewBox="0 0 200 50"') =>
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" ${root}>${content}</svg>`,
  );
it("rasterizes the website's passive full drawing without inventing or recoloring its artwork", async () => {
  const image = await prepareWebsiteSuggestion(
    drawing('<path d="M0 0H200V50H0Z" fill="#000000"/>'),
    "image/svg+xml",
    "wordmark",
  );
  expect(image.contentType).toBe("image/png");
  expect(await sharp(image.bytes).metadata()).toMatchObject({
    format: "png",
    width: 1024,
    height: 256,
  });
  const { data } = await sharp(image.bytes)
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect([...data.subarray(0, 4)]).toEqual([0, 0, 0, 255]);
});
it.each([
  "<script>alert(1)</script>",
  '<image href="http://127.0.0.1/private"/>',
  '<use href="file:///secret"/>',
  "<foreignObject><p>Logo</p></foreignObject>",
  '<path d="M0 0H2" fill="url(http://private)"/>',
  "<style>path{fill:red}</style>",
  "<text>Invented logo</text>",
  '<path d="&external;"/>',
])("rejects active content and referenced resources: %s", async (content) => {
  await expect(
    prepareWebsiteSuggestion(drawing(content), "image/svg+xml", "wordmark"),
  ).rejects.toThrow();
});
it.each([
  'viewBox="0 0 200 50" onload="alert(1)"',
  'viewBox="0 0 999999999 50"',
  'viewBox="0 0 200 50" style="fill:url(file:///secret)"',
])("rejects unsafe root attributes and dimensions: %s", async (root) => {
  await expect(
    prepareWebsiteSuggestion(
      drawing('<path d="M0 0H200V50Z"/>', root),
      "image/svg+xml",
      "wordmark",
    ),
  ).rejects.toThrow();
});
it("rejects compact icons as wordmarks and keeps OG image bytes intact", async () => {
  const png = await sharp({
    create: { width: 64, height: 64, channels: 4, background: "black" },
  })
    .png()
    .toBuffer();
  await expect(
    prepareWebsiteSuggestion(png, "image/png", "wordmark"),
  ).rejects.toThrow("not a full wordmark");
  expect(
    Buffer.from(
      (await prepareWebsiteSuggestion(png, "image/png", "media")).bytes,
    ),
  ).toEqual(png);
});
it("darkens white artwork without a background and preserves its transparency", async () => {
  const image = await prepareWebsiteSuggestion(
    drawing('<path d="M20 10H180V40H20Z" style="fill:#fff"/>'),
    "image/svg+xml",
    "wordmark",
  );
  const { data, info } = await sharp(image.bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(data[3]).toBe(0);
  const middle =
    (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4;
  expect([...data.subarray(middle, middle + 4)]).toEqual([38, 38, 38, 255]);
  await expect(
    prepareWebsiteSuggestion(
      drawing('<path d="M0 0H200V50Z" style="fill:url(file:///secret)"/>'),
      "image/svg+xml",
      "wordmark",
    ),
  ).rejects.toThrow();
});
it("preserves every alpha value when darkening a transparent white raster wordmark", async () => {
  const source = Buffer.from([
    255, 255, 255, 0, 255, 255, 255, 80, 255, 255, 255, 160, 255, 255, 255, 255,
  ]);
  const png = await sharp(source, { raw: { width: 4, height: 1, channels: 4 } })
    .png()
    .toBuffer();
  const image = await prepareWebsiteSuggestion(png, "image/png", "wordmark");
  const data = await sharp(image.bytes).ensureAlpha().raw().toBuffer();
  expect([...data].filter((_, index) => index % 4 === 3)).toEqual([
    0, 80, 160, 255,
  ]);
  expect([...data.subarray(12, 16)]).toEqual([38, 38, 38, 255]);
});
it("darkens grayscale PNG wordmarks while preserving their alpha", async () => {
  const source = Buffer.from([
    255, 255, 255, 0, 255, 255, 255, 80, 255, 255, 255, 160, 255, 255, 255, 255,
  ]);
  const png = await sharp(source, { raw: { width: 4, height: 1, channels: 4 } })
    .greyscale()
    .toColourspace("b-w")
    .png()
    .toBuffer();
  expect((await sharp(png).metadata()).channels).toBe(2);
  const image = await prepareWebsiteSuggestion(png, "image/png", "wordmark");
  const data = await sharp(image.bytes)
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer();
  expect([...data].filter((_, index) => index % 4 === 3)).toEqual([
    0, 80, 160, 255,
  ]);
  expect([...data.subarray(12, 16)]).toEqual([38, 38, 38, 255]);
});
it("keeps colored and opaque raster artwork untouched", async () => {
  for (const color of ["#0099ff", "#ffffff"]) {
    const png = await sharp({
      create: { width: 200, height: 50, channels: 4, background: color },
    })
      .png()
      .toBuffer();
    expect(
      Buffer.from(
        (await prepareWebsiteSuggestion(png, "image/png", "wordmark")).bytes,
      ),
    ).toEqual(png);
  }
  const image = await prepareWebsiteSuggestion(
    drawing('<path d="M20 10H180V40H20Z" fill="#0099ff"/>'),
    "image/svg+xml",
    "wordmark",
  );
  const { data, info } = await sharp(image.bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const center =
    (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * 4;
  expect([...data.subarray(center, center + 4)]).toEqual([0, 153, 255, 255]);
});
