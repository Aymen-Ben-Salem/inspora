import { describe, expect, it } from "vitest";
import { parseTransferArguments, assertManifestPin, assertTransferIdentity } from "./content-transfer-environment";
import { createHash } from "node:crypto";

describe("transfer entry guards", () => {
  it("explicitly selects new-only scope and rejects cleanup or duplicate flags", () => {
    expect(parseTransferArguments([]).newOnly).toBe(false);
    expect(parseTransferArguments(["--new-only"]).newOnly).toBe(true);
    expect(()=>parseTransferArguments(["--new-only","--new-only"])).toThrow();
    expect(()=>parseTransferArguments(["--new-only","--cleanup","--manifest","m.json","--sha256","a".repeat(64)])).toThrow();
  });
  it("rejects another account or database even on the same endpoint and bucket", () => {
    const input = { r2AccountId: "approved", databaseUrl: "postgres://user:pass@endpoint.neon.tech/neondb", databaseUrlUnpooled: "postgres://user:pass@endpoint.neon.tech/neondb" };
    const hash = (s: string) => createHash("sha256").update(s).digest("hex");
    const expected = { account: hash("approved"), database: hash("/neondb") };
    expect(() => assertTransferIdentity(input, expected)).not.toThrow();
    expect(() => assertTransferIdentity({ ...input, r2AccountId: "other" }, expected)).toThrow();
    expect(() => assertTransferIdentity({ ...input, databaseUrl: input.databaseUrl.replace("/neondb", "/other") }, expected)).toThrow();
    expect(() => assertTransferIdentity({ ...input, databaseUrlUnpooled: input.databaseUrl.replace("/neondb", "/other") }, expected)).toThrow();
  });
  it("defaults to dry run and requires an explicit manifest digest for writes", () => {
    expect(parseTransferArguments([]).mode).toBe("dry-run");
    expect(() => parseTransferArguments(["--apply"])).toThrow();
    expect(() => parseTransferArguments(["--apply", "--cleanup"])).toThrow();
    expect(() => parseTransferArguments(["--force"])).toThrow();
    expect(parseTransferArguments(["--apply", "--manifest", "manifest.json", "--sha256", "a".repeat(64)]).mode).toBe("apply");
  });
  it("rejects altered or missing pins", () => {
    const raw = '{"version":1}';
    const digest = createHash("sha256").update(raw).digest("hex");
    expect(() => assertManifestPin(raw, digest)).not.toThrow();
    expect(() => assertManifestPin(raw + " ", digest)).toThrow();
    expect(() => assertManifestPin(raw, "")).toThrow();
  });
});
