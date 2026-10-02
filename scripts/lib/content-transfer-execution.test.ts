import { describe, expect, it, vi } from "vitest";
import { applyContentTransfer, captureContentSnapshot, deleteExactTestWebsite } from "./content-transfer-database";
import { D1, EXCLUDED_WEBSITE_ID, type ContentTransferPlan, type Row } from "./content-transfer-plan";

function database() {
  const tables = ["creators", "posts", "post_media", "logos", "logo_media", "websites", "website_media", "website_sections", "creator_username_aliases", "design_categories", "admin_audit_logs", "saved_posts"];
  const state = { rows: Object.fromEntries(tables.map(t => [t, [] as Row[]])), after: null as Record<string, Row[]> | null, write: false, corrupt: false, cleanup: false };
  const query = vi.fn(async (sql: string, values?: unknown[]): Promise<{ rows: Row[]; rowCount: number }> => {
    if (sql.startsWith("select tablename")) return { rows: tables.map(tablename => ({ tablename })), rowCount: tables.length };
    if (sql.startsWith("select now()")) return { rows: [{ captured_at: "2026-09-28" }], rowCount: 1 };
    if (sql.startsWith("select (to_jsonb")) {
      const table = /public\."([^"]+)"/.exec(sql)![1];
      return { rows: (state.write && state.after ? state.after : state.rows)[table].map(row => ({ row })), rowCount: 0 };
    }
    if (sql.includes(" as sha256")) {
      const preserve = sql.includes("jsonb_to_recordset");
      return { rows: [{ count: 0, sha256: state.corrupt && state.write && (preserve || state.cleanup) ? "corrupt" : "hash" }], rowCount: 1 };
    }
    if (sql.startsWith("select count")) return { rows: [{ count: 0 }], rowCount: 1 };
    if (/^(update|insert|delete)/.test(sql)) {
      state.write = true;
      const payload = typeof values?.[0] === "string" && values[0].startsWith("[") ? JSON.parse(values[0]) : [1];
      return { rows: [], rowCount: payload.length };
    }
    return { rows: [], rowCount: 0 };
  });
  return { state, query };
}

describe("actual bounded database operations", () => {
  it.each([false, true])("orders D1 references before deletion; preservation corruption=%s", async corrupt => {
    const db = database();
    const auric = { id: D1.auric, creator_id: D1.duplicate };
    db.state.rows.logos = [auric];
    const expected = await captureContentSnapshot(db, "preview");
    const desired = structuredClone(expected.rows);
    desired.logos = [{ ...auric, creator_id: D1.survivor }];
    db.state.after = desired;
    db.state.corrupt = corrupt;
    const plan = { desired, changes: [{ table: "logos", id: D1.auric, before: auric, after: desired.logos[0], fields: ["creator_id"], beforeHash: "", afterHash: "" }], aliasInserts: [], mergeDuplicate: true, mediaKeys: [], productionMediaKeys: [], preservedPreviewMediaKeys: [], protectedWorkIds: [D1.auric] } satisfies ContentTransferPlan;
    if (corrupt) await expect(applyContentTransfer(db, expected, plan, vi.fn())).rejects.toThrow(/non-allowlisted/);
    else await applyContentTransfer(db, expected, plan, vi.fn());
    const commands = db.query.mock.calls.map(c => c[0]);
    const deletion = commands.findIndex(s => s.startsWith("delete from creators"));
    expect(commands.findIndex(s => s.startsWith("update creator_username_aliases"))).toBeLessThan(deletion);
    expect(commands.findIndex(s => s.startsWith("update admin_audit_logs"))).toBeLessThan(deletion);
    expect(commands.findIndex(s => s.startsWith('update public."logos"'))).toBeLessThan(deletion);
    expect(commands.at(-1)).toBe(corrupt ? "ROLLBACK" : "COMMIT");
  });
  it.each([false, true])("deletes only the exact website and checks unrelated rows; corruption=%s", async corrupt => {
    const db = database();
    db.state.rows.websites = [{ id: EXCLUDED_WEBSITE_ID }];
    const expected = await captureContentSnapshot(db, "preview");
    db.state.cleanup = true;
    db.state.corrupt = corrupt;
    if (corrupt) await expect(deleteExactTestWebsite(db, expected, EXCLUDED_WEBSITE_ID, vi.fn())).rejects.toThrow(/unrelated/);
    else await deleteExactTestWebsite(db, expected, EXCLUDED_WEBSITE_ID, vi.fn());
    const deletes = db.query.mock.calls.filter(c => c[0].startsWith("delete"));
    expect(deletes).toEqual([["delete from websites where id=$1::uuid returning id", [EXCLUDED_WEBSITE_ID]]]);
    expect(db.query.mock.calls.at(-1)?.[0]).toBe(corrupt ? "ROLLBACK" : "COMMIT");
  });
});
