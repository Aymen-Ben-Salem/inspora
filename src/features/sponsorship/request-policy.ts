import "server-only";
export function assertSponsorWriteRequest(request: Request) {
  const origin = request.headers.get("origin");
  if (
    !origin ||
    origin !== new URL(request.url).origin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new Error("Use this site's sponsor editor to make changes.");
}
export async function readSponsorJson(
  request: Request,
  maxBytes = 16384,
): Promise<unknown> {
  assertSponsorWriteRequest(request);
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("Use a JSON sponsor request.");
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes)
    throw new Error("Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Request body is missing.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Request is too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
