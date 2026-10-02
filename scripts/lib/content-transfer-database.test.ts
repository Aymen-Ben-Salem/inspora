import { describe, expect, it, vi } from "vitest";
import { runCheckedTransaction, assertSnapshotUnchanged, assertCleanupScope, assertCleanupRecovery } from "./content-transfer-database";
import { EXCLUDED_WEBSITE_ID, type ContentSnapshot } from "./content-transfer-plan";

describe("bounded database transfer", () => {
  it("requires recovery coverage for every cleanup table even after import", () => {
    const recovered = Object.fromEntries(["websites", "website_media", "website_sections", "saved_posts"].map(t => [t, { count: 1, sha256: "before" }]));
    const snapshot = { tableHashes: { ...recovered, posts: { count: 250, sha256: "imported" } } } as unknown as ContentSnapshot;
    expect(() => assertCleanupRecovery(snapshot, recovered)).not.toThrow();
    for (const table of Object.keys(recovered)) expect(() => assertCleanupRecovery(snapshot, { ...recovered, [table]: { count: 1, sha256: "older" } })).toThrow(/recovery/);
    expect(() => assertCleanupRecovery(snapshot, {})).toThrow(/recovery/);
  });
  it("rejects snapshot drift before the write callback and rolls back", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const write = vi.fn();
    await expect(runCheckedTransaction({ query }, { guard: vi.fn(), lock: async () => {}, checkBefore: async () => { throw Error("snapshot drift"); }, write, verify: vi.fn() })).rejects.toThrow("snapshot drift");
    expect(write).not.toHaveBeenCalled();
    expect(query.mock.calls.map(c => c[0])).toEqual(["BEGIN ISOLATION LEVEL SERIALIZABLE", "SET LOCAL lock_timeout = '5s'", "SET LOCAL statement_timeout = '30s'", "ROLLBACK"]);
  });
  it("rolls back a failed after-state assertion without committing", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const write = vi.fn();
    await expect(runCheckedTransaction({ query }, { guard: vi.fn(), lock: async () => {}, checkBefore: vi.fn(), write, verify: async () => { throw Error("protected rows changed"); } })).rejects.toThrow("protected rows changed");
    expect(write).toHaveBeenCalledOnce();
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
    expect(query.mock.calls.some(c => c[0] === "COMMIT")).toBe(false);
  });
  it("rejects a wrong environment before opening a write transaction", async () => {
    const query = vi.fn();
    await expect(runCheckedTransaction({ query }, { guard: () => { throw Error("target rejected"); }, lock: vi.fn(), checkBefore: vi.fn(), write: vi.fn(), verify: vi.fn() })).rejects.toThrow("target rejected");
    expect(query).not.toHaveBeenCalled();
  });
  it("commits only after checking and verifying the scoped write", async () => {
    const events: string[] = [];
    const query = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    await runCheckedTransaction({ query }, { guard: () => { events.push("guard"); }, lock: async () => { events.push("lock"); }, checkBefore: async () => { events.push("check"); }, write: async () => { events.push("write"); }, verify: async () => { events.push("verify"); } });
    expect(events).toEqual(["guard", "lock", "check", "write", "verify"]);
    expect(query).toHaveBeenLastCalledWith("COMMIT");
  });
  it("detects private/unrelated table drift and enforces the exact cleanup ID", () => {
    const snapshot = { schema: [], ledger: [], constraints: [], indexes: [], tableHashes: { profile_accounts: { count: 1, sha256: "before" } } } as unknown as ContentSnapshot;
    expect(() => assertSnapshotUnchanged(snapshot, { ...snapshot, tableHashes: { profile_accounts: { count: 1, sha256: "after" } } })).toThrow(/drift/);
    expect(() => assertCleanupScope("some-other-website")).toThrow();
    expect(() => assertCleanupScope(EXCLUDED_WEBSITE_ID)).not.toThrow();
  });
});
