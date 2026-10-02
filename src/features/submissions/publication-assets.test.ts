import { expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { WriteTx } from "../../db/write-client";
vi.mock("server-only", () => ({}));
const verify = vi.hoisted(() => vi.fn());
vi.mock("../../storage/r2", () => ({ assertR2StorageKeysExist: verify }));
import { protectPublicationMedia } from "./publication-assets";

it("locks shared primary/variant/preview/poster keys in deterministic order before verifying bytes", async () => {
  const keys: string[] = [];
  const tx = { execute: vi.fn(async (query) => { keys.push(new PgDialect().sqlToQuery(query).params[0] as string); }) } as unknown as WriteTx;
  verify.mockImplementationOnce(async (checked) => {
    expect(keys).toEqual(["submission-publication:a", "submission-publication:b", "submission-publication:c", "submission-publication:d"]);
    expect(checked).toEqual(["a","b","c","d"]);
  });
  await protectPublicationMedia(tx,[{ storageProvider:"r2",storageKey:"b",variants:[{storageKey:"a"},{storageKey:"b"}],videoPreview:{storageKey:"c"},posterStorageKey:"d" }]);
});
it("rejects already-deleted managed media instead of allowing a publication retry", async () => {
  verify.mockRejectedValueOnce(new Error("missing media"));
  const tx = { execute: vi.fn() } as unknown as WriteTx;
  await expect(protectPublicationMedia(tx,[{storageProvider:"r2",storageKey:"deleted"}])).rejects.toThrow("missing media");
});
