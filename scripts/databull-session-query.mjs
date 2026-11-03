import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// A local preparation tool only: no Cloudflare calls, deployment, or DB writes.
// Never apply to a different vendor build without repeating the equivalence tests.
export const vendorSha256 = "1c6d4a84e1642f3844d605622947d7fe6a3e788206be81ab697291d12ac8a148";
export const originalQuery = "SELECT id, last_activity, (SELECT COUNT(*) FROM sessions WHERE site_id = ?1 AND visitor_id = ?2) AS n FROM sessions WHERE site_id = ?1 AND visitor_id = ?2 ORDER BY last_activity DESC LIMIT 1";
// The installed activity index scans equal timestamps in descending rowid order.
// Preserve that tie choice explicitly when using the existing visitor index.
export const patchedQuery = "SELECT id, last_activity, (SELECT COUNT(*) FROM sessions WHERE site_id = ?1 AND visitor_id = ?2) AS n FROM sessions INDEXED BY idx_sessions_visitor WHERE site_id = ?1 AND visitor_id = ?2 ORDER BY last_activity DESC, rowid DESC LIMIT 1";

export function prepareSessionQueryPatch(source) {
  const hash = createHash("sha256").update(source).digest("hex");
  if (hash !== vendorSha256) throw new Error("Unrecognized DataBull Worker. Recheck the vendor version and session ordering before preparing a patch.");
  const text = source.toString("utf8");
  if (text.split(originalQuery).length !== 2) throw new Error("Expected exactly one original session lookup.");
  return Buffer.from(text.replace(originalQuery, patchedQuery));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || resolve(input) === resolve(output)) {
    throw new Error("Usage: node scripts/databull-session-query.mjs <original-worker.js> <new-candidate.js>");
  }
  const result = prepareSessionQueryPatch(await readFile(input));
  await writeFile(output, result, { flag: "wx" });
  console.log(JSON.stringify({ candidateSha256: createHash("sha256").update(result).digest("hex"), deployed: false }));
}
