import "server-only";
import { editorialContentHash } from "../../../tools/inspora-mcp/editorial-notes.mjs";
import type { EditorialKind } from "./editorial-contract";
import { editorialSnapshot } from "./editorial-snapshot";

/**
 * The search-note content hash for admin work input, mapped to the row shape the
 * MCP catalog view returns. Saving notes and the edit-page stale check both use it,
 * so a note saved here is current exactly when the MCP would accept it.
 */
export function editorialHashFromInput(kind: EditorialKind, input: Record<string, unknown>) {
  const snapshot = editorialSnapshot(kind, input);
  const media = snapshot.media
    // The catalog view omits website full-page captures.
    .filter((item) => kind !== "website" || item.type !== "full_page")
    .map((item) => ({ ...item, poster: kind === "logo" || kind === "icon" ? null : item.posterUrl || null }));
  return editorialContentHash({ ...input, kind, source_url: input.sourceUrl, media });
}
