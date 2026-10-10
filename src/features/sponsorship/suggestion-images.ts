import "server-only";
import sharp from "sharp";
import { inspectSponsorMedia } from "./media-inspection";

const drawingTags = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
]);
const numbers = /^[\d.eE+\-,\s]+$/;
const numericAttributes = new Set([
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "width",
  "height",
  "opacity",
  "fill-opacity",
  "stroke-opacity",
  "stroke-width",
  "stroke-miterlimit",
]);
const ignoredAttributes = new Set([
  "xmlns",
  "xmlns:xlink",
  "version",
  "id",
  "data-name",
  "role",
  "aria-label",
]);

// Rebuild a small, passive drawing. No source XML, CSS, references or text reach
// the renderer, so it cannot load files/fonts/images or execute active content.
function passiveDrawing(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > 256 * 1024)
    throw new Error("Website SVG is too large.");
  const source = new TextDecoder()
    .decode(bytes)
    .replace(/^\s*<\?xml[^<>]*\?>/, "");
  const stack: string[] = [];
  const output: string[] = [];
  let position = 0,
    tags = 0,
    dimensions: number[] | undefined;
  for (const match of source.matchAll(/<[^<>]*>/g)) {
    if (source.slice(position, match.index).trim() || ++tags > 2000)
      throw new Error("Unsupported website SVG.");
    position = match.index + match[0].length;
    const tag = /^<(\/)?([a-z]+)\b([\s\S]*?)(\/?)>$/.exec(match[0]);
    if (!tag || !drawingTags.has(tag[2]))
      throw new Error("Use a passive SVG drawing.");
    const [, closing, name, rawAttributes, selfClosing] = tag;
    if (closing) {
      if (rawAttributes.trim() || selfClosing || stack.pop() !== name)
        throw new Error("Invalid SVG structure.");
      output.push(`</${name}>`);
      continue;
    }
    if (!stack.length && (name !== "svg" || dimensions))
      throw new Error("Invalid SVG root.");
    if (stack.length && name === "svg")
      throw new Error("Nested SVG is unsupported.");
    const attributes: Record<string, string> = {};
    const attribute = /\s*([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/y;
    let offset = 0;
    while (rawAttributes.slice(offset).trim()) {
      attribute.lastIndex = offset;
      const parsed = attribute.exec(rawAttributes);
      if (!parsed || parsed[1] in attributes)
        throw new Error("Invalid SVG attributes.");
      const value = parsed[2] ?? parsed[3];
      if (/[<&]/.test(value)) throw new Error("SVG entities are unsupported.");
      attributes[parsed[1]] = value;
      offset = attribute.lastIndex;
    }
    if (name === "svg") {
      const box = attributes.viewBox
        ?.trim()
        .split(/[\s,]+/)
        .map(Number) ?? [
        0,
        0,
        Number(attributes.width),
        Number(attributes.height),
      ];
      if (
        box.length !== 4 ||
        !box.every(Number.isFinite) ||
        box[2] <= 0 ||
        box[3] <= 0 ||
        box[2] > 4096 ||
        box[3] > 4096 ||
        box.slice(0, 2).some((n) => Math.abs(n) > 1e6)
      )
        throw new Error("Unsupported SVG dimensions.");
      dimensions = box;
      const scale = Math.min(1024 / box[2], 512 / box[3]);
      output.push(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(" ")}" width="${Math.max(1, Math.round(box[2] * scale))}" height="${Math.max(1, Math.round(box[3] * scale))}">`,
      );
    } else {
      // Inline presentation is rebuilt as validated drawing attributes. No
      // original CSS or resource references reach the renderer.
      if (attributes.style) {
        for (const declaration of attributes.style.split(";")) {
          if (!declaration.trim()) continue;
          const colon = declaration.indexOf(":");
          const key = declaration.slice(0, colon).trim();
          const value = declaration.slice(colon + 1).trim();
          if (
            colon < 1 ||
            ![
              "fill",
              "stroke",
              "opacity",
              "fill-opacity",
              "stroke-opacity",
              "stroke-width",
            ].includes(key) ||
            key in attributes
          )
            throw new Error("Unsupported SVG presentation.");
          attributes[key] = value;
        }
        delete attributes.style;
      }
      const safeAttributes: string[] = [];
      for (const [key, value] of Object.entries(attributes)) {
        if (ignoredAttributes.has(key)) continue;
        const valid = numericAttributes.has(key)
          ? numbers.test(value) &&
            Number.isFinite(Number(value)) &&
            Math.abs(Number(value)) <= 1e6
          : key === "d"
            ? /^[\d.eE+\-,\sMmLlHhVvCcSsQqTtAaZz]+$/.test(value)
            : key === "points"
              ? numbers.test(value)
              : key === "fill" || key === "stroke"
                ? /^(?:none|currentColor|black|white|#[\da-f]{3,8}|rgba?\([\d.,%\s]+\))$/i.test(
                    value,
                  )
                : key === "transform"
                  ? /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\([\d.eE+\-,\s]+\)\s*)+$/.test(
                      value,
                    )
                  : key === "fill-rule" || key === "clip-rule"
                    ? /^(?:nonzero|evenodd)$/.test(value)
                    : key === "stroke-linecap"
                      ? /^(?:butt|round|square)$/.test(value)
                      : key === "stroke-linejoin"
                        ? /^(?:miter|round|bevel)$/.test(value)
                        : false;
        if (!valid) throw new Error("Unsupported SVG drawing attribute.");
        safeAttributes.push(`${key}="${value}"`);
      }
      output.push(
        `<${name}${safeAttributes.length ? ` ${safeAttributes.join(" ")}` : ""}${selfClosing ? "/" : ""}>`,
      );
    }
    // Root attributes outside this whitelist are rejected, even though the root
    // is rebuilt, to keep scripts and external references explicitly forbidden.
    if (
      name === "svg" &&
      Object.keys(attributes).some(
        (key) =>
          !ignoredAttributes.has(key) &&
          !["viewBox", "width", "height"].includes(key),
      )
    )
      throw new Error("Unsupported SVG root attribute.");
    if (!selfClosing) stack.push(name);
    else if (name === "svg") output.push("</svg>");
  }
  if (!dimensions || stack.length || source.slice(position).trim())
    throw new Error("Invalid SVG drawing.");
  return Buffer.from(output.join(""));
}

export async function prepareWebsiteSuggestion(
  bytes: Uint8Array,
  contentType: string,
  kind: "icon" | "wordmark" | "media",
) {
  const vector = contentType === "image/svg+xml";
  if (contentType === "image/svg+xml") {
    if (kind === "media")
      throw new Error("The website OG image must be a supported raster image.");
    bytes = await sharp(passiveDrawing(bytes), { limitInputPixels: 1024 * 512 })
      .timeout({ seconds: 2 })
      .png()
      .toBuffer();
    contentType = "image/png";
  }
  const dimensions = await inspectSponsorMedia(bytes, contentType, kind);
  if (kind === "wordmark" && dimensions.width <= dimensions.height * 1.5)
    throw new Error("The website logo is an icon, not a full wordmark.");
  if (kind !== "media" && dimensions.width * dimensions.height <= 4_000_000) {
    const pixels = await sharp(bytes, { limitInputPixels: 4_000_000 })
      .ensureAlpha()
      .timeout({ seconds: 2 })
      .raw()
      .toBuffer();
    let visible = 0,
      white = 0,
      transparent = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 3] < 32) {
        transparent++;
        continue;
      }
      visible++;
      if (pixels[i] > 245 && pixels[i + 1] > 245 && pixels[i + 2] > 245)
        white++;
    }
    // Darken only uniformly white artwork. Preserve the alpha channel and all
    // edges; an opaque raster cannot reveal which pixels are its background.
    if (!visible)
      throw new Error("The website SVG contains no visible artwork.");
    if (white === visible && (vector || transparent)) {
      bytes = await sharp(bytes)
        .ensureAlpha()
        .linear(0, 38)
        .timeout({ seconds: 2 })
        .png()
        .toBuffer();
      contentType = "image/png";
    }
  }
  return { bytes, contentType };
}
