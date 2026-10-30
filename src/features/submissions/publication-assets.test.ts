import { afterEach, expect, it, vi } from "vitest";
afterEach(() => vi.unstubAllEnvs());
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

it("protects public URLs without metadata so a new reference cannot race file deletion", async () => {
  vi.stubEnv("R2_PUBLIC_BASE_URL", "https://media.example/public");
  verify.mockResolvedValueOnce(undefined);
  const keys: string[] = [];
  const tx = { execute: vi.fn(async query => { keys.push(new PgDialect().sqlToQuery(query).params[0] as string); }) } as unknown as WriteTx;
  await protectPublicationMedia(tx, [{ url: "https://media.example/public/creators/shared.webp?width=400" }, { url: "https://external.example/public/creators/other.webp" }]);
  expect(keys).toEqual(["submission-publication:creators/shared.webp"]);
  expect(verify).toHaveBeenLastCalledWith(["creators/shared.webp"]);
});
