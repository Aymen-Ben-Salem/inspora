import "server-only";
import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";

type Address = { address: string; family: number };
type Response = {
  status: number;
  headers: Record<string, string | undefined>;
  bytes: Uint8Array;
};
type RequestInput = Address & {
  url: URL;
  maxBytes: number;
  signal: AbortSignal;
};
export type MetadataFetchDependencies = {
  resolve(host: string): Promise<Address[]>;
  request(input: RequestInput): Promise<Response>;
};
const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(network, prefix, "ipv4");
blocked.addSubnet("2001::", 23, "ipv6");
blocked.addSubnet("2002::", 16, "ipv6");
const globalIpv6 = new BlockList();
globalIpv6.addSubnet("2000::", 3, "ipv6");
function publicAddress(address: string) {
  const family = isIP(address);
  return family === 4
    ? !blocked.check(address, "ipv4")
    : family === 6 &&
        globalIpv6.check(address, "ipv6") &&
        !blocked.check(address, "ipv6");
}
function safeUrl(raw: string) {
  if (raw.length > 2048) throw new Error("Website URL is too long.");
  const url = new URL(raw);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    !["", "80", "443"].includes(url.port)
  )
    throw new Error("Use a public HTTP(S) website URL.");
  url.hash = "";
  return url;
}
function timed<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("Metadata request timed out."));
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}
function decode(value: string) {
  return value.replace(
    /&(?:amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi,
    (entity) => {
      const named: Record<string, string> = {
        "&amp;": "&",
        "&quot;": '"',
        "&apos;": "'",
        "&lt;": "<",
        "&gt;": ">",
      };
      if (named[entity]) return named[entity];
      const n = entity.startsWith("&#x")
        ? parseInt(entity.slice(3), 16)
        : parseInt(entity.slice(2), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
    },
  );
}
function attributes(tag: string) {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(
    /([a-z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
  ))
    result[match[1].toLowerCase()] = decode(match[2] ?? match[3] ?? match[4]);
  return result;
}
function imageUrl(raw: unknown, base: URL) {
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    return safeUrl(new URL(raw.trim(), base).href).href;
  } catch {
    return undefined;
  }
}
function structuredLogo(value: unknown, depth = 0): string | undefined {
  if (!value || typeof value !== "object" || depth > 4) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const logo = structuredLogo(item, depth + 1);
      if (logo) return logo;
    }
    return undefined;
  }
  const node = value as Record<string, unknown>;
  const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
  if (
    types.some((type) =>
      ["Organization", "Corporation", "Brand", "WebSite"].includes(
        String(type),
      ),
    )
  ) {
    if (typeof node.logo === "string") return node.logo;
    if (node.logo && typeof node.logo === "object") {
      const logo = node.logo as Record<string, unknown>;
      const url = logo.contentUrl ?? logo.url;
      if (typeof url === "string") return url;
    }
  }
  return (
    structuredLogo(node["@graph"], depth + 1) ??
    structuredLogo(node.publisher, depth + 1)
  );
}
function websiteWordmark(html: string, base: URL) {
  // Explicit wordmarks take priority over a site's general organization logo.
  for (const match of html.matchAll(/<img\b[^<>]*>/gi)) {
    const a = attributes(match[0]);
    if (/wordmark/i.test([a.alt, a.id, a.class, a.src].join(" "))) {
      const url = imageUrl(a.src, base);
      if (url) return url;
    }
  }
  const lowerHtml = html.toLowerCase();
  let scriptEnd = 0;
  for (const match of html.matchAll(/<script\b[^<>]*>/gi)) {
    if (match.index < scriptEnd) continue;
    const start = match.index + match[0].length;
    const end = lowerHtml.indexOf("</script>", start);
    if (end === -1) break;
    scriptEnd = end + "</script>".length;
    if (attributes(match[0]).type?.toLowerCase() !== "application/ld+json")
      continue;
    try {
      const url = imageUrl(
        structuredLogo(JSON.parse(html.slice(start, end))),
        base,
      );
      if (url) return url;
    } catch {
      // Invalid optional structured data must not discard the icon or OG image.
    }
  }
  const headerStart = /<header\b[^<>]*>/i.exec(html);
  const headerEnd = headerStart
    ? lowerHtml.indexOf("</header>", headerStart.index + headerStart[0].length)
    : -1;
  const header =
    headerStart && headerEnd !== -1
      ? html.slice(headerStart.index + headerStart[0].length, headerEnd)
      : "";
  for (const match of header.matchAll(/<img\b[^<>]*>/gi)) {
    const a = attributes(match[0]);
    if (/logo/i.test([a.alt, a.id, a.class, a.src].join(" "))) {
      const url = imageUrl(a.src, base);
      if (url) return url;
    }
  }
  return undefined;
}
export function createMetadataFetcher(deps: MetadataFetchDependencies) {
  async function fetchPublic(
    raw: string,
    maxBytes: number,
    signal: AbortSignal,
  ): Promise<Response & { url: URL }> {
    let url = safeUrl(raw);
    for (let redirects = 0; redirects <= 3; redirects++) {
      signal.throwIfAborted();
      const host = url.hostname.replace(/^\[|\]$/g, "");
      const family = isIP(host);
      const addresses = family
        ? [{ address: host, family }]
        : await timed(deps.resolve(host), signal);
      if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
        throw new Error(
          "Private or special network destinations are unavailable.",
        );
      const response = await timed(
        deps.request({ ...addresses[0], url, maxBytes, signal }),
        signal,
      );
      if (response.bytes.byteLength > maxBytes)
        throw new Error("Metadata response is too large.");
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        if (!response.headers.location || redirects === 3)
          throw new Error("Too many website redirects.");
        url = safeUrl(new URL(response.headers.location, url).href);
        continue;
      }
      if (response.status < 200 || response.status >= 300)
        throw new Error("Website metadata is unavailable.");
      return { ...response, url };
    }
    throw new Error("Website metadata is unavailable.");
  }
  return {
    fetchPublic,
    async suggest(raw: string, signal = AbortSignal.timeout(4000)) {
      const response = await fetchPublic(raw, 2 * 1024 * 1024, signal);
      if (
        !response.headers["content-type"]?.toLowerCase().startsWith("text/html")
      )
        throw new Error("Website did not return HTML.");
      const html = new TextDecoder().decode(response.bytes);
      let title = decode(
        html.match(/<title\b[^>]*>([^<]*)<\/title>/i)?.[1] ?? "",
      )
        .trim()
        .slice(0, 160);
      let ogImageUrl: string | undefined, iconUrl: string | undefined;
      for (const match of html.matchAll(/<(?:meta|link)\b[^>]*>/gi)) {
        const a = attributes(match[0]);
        if (a.property === "og:title" && !title)
          title = a.content?.trim().slice(0, 160) ?? "";
        if ((a.property ?? a.name)?.toLowerCase() === "og:image" && !ogImageUrl)
          ogImageUrl = imageUrl(a.content, response.url);
        if (a.rel?.split(/\s+/).includes("icon") && a.href)
          iconUrl = imageUrl(a.href, response.url) ?? iconUrl;
        if (
          a.rel?.split(/\s+/).includes("apple-touch-icon") &&
          a.href &&
          !iconUrl
        )
          iconUrl = imageUrl(a.href, response.url);
      }
      return {
        title: title || undefined,
        imageUrl: ogImageUrl,
        iconUrl,
        wordmarkUrl: websiteWordmark(html, response.url),
      };
    },
  };
}
export const metadataFetcher = createMetadataFetcher({
  resolve: (host) => lookup(host, { all: true, verbatim: true }),
  request: ({ url, address, family, maxBytes, signal }) =>
    new Promise((resolve, reject) => {
      const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
        url,
        {
          method: "GET",
          agent: false,
          signal,
          maxHeaderSize: 16384,
          headers: {
            "User-Agent": "Inspora-Sponsor-Metadata/1.0",
            "Accept-Encoding": "identity",
            Accept: "text/html,image/*",
          },
          // Preserve TLS SNI/Host from the URL, but never resolve the hostname again.
          lookup: (_host, options, callback) => {
            const all =
              typeof options === "object" && "all" in options && options.all;
            if (all)
              (
                callback as unknown as (
                  error: null,
                  addresses: Address[],
                ) => void
              )(null, [{ address, family }]);
            else callback(null, address, family);
          },
        },
        (response) => {
          if (
            Number(response.headers["content-length"] ?? 0) > maxBytes ||
            ![undefined, "identity"].includes(
              response.headers["content-encoding"],
            )
          ) {
            response.destroy();
            reject(new Error("Metadata response is too large or compressed."));
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on("data", (chunk) => {
            size += chunk.length;
            if (size > maxBytes) {
              response.destroy(new Error("Metadata response is too large."));
            } else chunks.push(chunk);
          });
          response.on("error", reject);
          response.on("end", () =>
            resolve({
              status: response.statusCode ?? 0,
              headers: {
                "content-type": response.headers["content-type"],
                location: response.headers.location,
              },
              bytes: Buffer.concat(chunks),
            }),
          );
        },
      );
      request.on("error", reject);
      request.end();
    }),
});
export { fillEmptySponsorFields } from "./suggestion-fields";
