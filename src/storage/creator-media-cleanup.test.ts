import { beforeEach, expect, it, vi } from "vitest";
const io = vi.hoisted(() => ({ lock: vi.fn(), references: vi.fn(), remove: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/db/write-client", () => ({ withWriteTransaction: (work: (tx: object) => unknown) => work({}) }));
vi.mock("@/features/submissions/publication-assets", () => ({ lockPublicationAssets: io.lock, readPublicMediaReferenceKeys: io.references, publicationAssetKeys: (assets: { storageKey: string; variantStorageKeys?: string[] }[]) => [...new Set(assets.flatMap(a => [a.storageKey, ...(a.variantStorageKeys ?? [])]))] }));
vi.mock("./r2", () => ({ deleteR2StorageKeys: io.remove, getR2PublicUrl: (key: string) => `https://media.example/${key}` }));
import { deleteUnreferencedCreatorMedia } from "./creator-media-cleanup";
beforeEach(() => { vi.clearAllMocks(); io.references.mockResolvedValue(new Set(["shared.webp"])); io.remove.mockResolvedValue(undefined); });
it("retains shared files and locks candidates before checking current references", async () => {
  await deleteUnreferencedCreatorMedia([{ storageProvider: "r2", storageKey: "own.webp", variantStorageKeys: ["shared.webp"], type: "image" }]);
  expect(io.lock.mock.invocationCallOrder[0]).toBeLessThan(io.references.mock.invocationCallOrder[0]);
  expect(io.remove).toHaveBeenCalledExactlyOnceWith(["own.webp"]);
});
it("propagates storage failures so the durable job remains retryable", async () => {
  io.remove.mockRejectedValueOnce(new Error("Unavailable"));
  await expect(deleteUnreferencedCreatorMedia([{ storageProvider: "r2", storageKey: "own.webp", type: "image" }])).rejects.toThrow("Unavailable");
});
