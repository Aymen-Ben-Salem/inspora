import { AnalyticsInputError } from "./collector";
export async function readAnalyticsJson(
  request: Request,
  limit: number,
): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new AnalyticsInputError("Missing body.");
  const chunks: Uint8Array[] = [],
    decoder = new TextDecoder();
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AnalyticsInputError("Batch too large.");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new AnalyticsInputError("Invalid analytics batch.");
  }
}
