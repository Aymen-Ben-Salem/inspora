import { createHash } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { CopyObjectCommand, DeleteObjectsCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

const storage = vi.hoisted(() => ({ send: vi.fn(), sign: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./r2-client", () => ({ createR2Client: () => ({ send: storage.send }) }));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: storage.sign }));
vi.mock("../../scripts/lib/environment-fingerprint", () => ({
  assertDataOperationEnvironment: vi.fn(), runtimeDataEnvironmentFromValues: vi.fn(),
}));
import { createOwnedAvatarUpload, freezeOwnedAvatarUpload, discardOwnedAvatarUpload } from "./r2";

const userId = "owner-a";
const prefix = "creators/uploads/" + createHash("sha256").update(userId).digest("hex") + "/";
const key = prefix + "11111111-1111-4111-8111-111111111111.webp";
const publicKey = "creators/22222222-2222-4222-8222-222222222222.webp";

beforeEach(() => {
  vi.resetAllMocks();
  for (const [name, value] of Object.entries({
    R2_ACCOUNT_ID: "test", R2_ACCESS_KEY_ID: "test", R2_SECRET_ACCESS_KEY: "test",
    R2_BUCKET_NAME: "test-bucket", R2_PUBLIC_BASE_URL: "https://media.example",
  })) vi.stubEnv(name, value);
  storage.sign.mockResolvedValue("https://upload.example");
  storage.send.mockImplementation(async (command) => {
    if (command instanceof HeadObjectCommand) return { ContentType: "image/webp", ContentLength: 1234, ETag: '"version-1"' };
    return {};
  });
});
afterEach(() => vi.unstubAllEnvs());

it("signs only a generated owner staging key, with the supplied size", async () => {
  const result = await createOwnedAvatarUpload(userId, 1234);
  expect(result.storageKey).toMatch(new RegExp("^" + prefix));
  const command = storage.sign.mock.calls[0]![1];
  expect(command).toBeInstanceOf(PutObjectCommand);
  expect(command.input).toMatchObject({ Key: result.storageKey, ContentLength: 1234, ContentType: "image/webp" });
  expect(result.storageKey).not.toMatch(/^creators\/[0-9a-f-]{36}\.webp$/);
});

it.each([
  ["owner-b", key], [userId, publicKey], [userId, prefix + "../victim.webp"],
])("rejects unauthorized completion and discard for %s %s before storage access", async (owner, storageKey) => {
  await expect(freezeOwnedAvatarUpload(owner, { storageKey, size: 1 })).rejects.toThrow();
  await discardOwnedAvatarUpload(owner, storageKey);
  expect(storage.send).not.toHaveBeenCalled();
});

it("failed verification cannot delete any object", async () => {
  await expect(freezeOwnedAvatarUpload(userId, { storageKey: key, size: 1 })).rejects.toThrow("did not match");
  expect(storage.send).toHaveBeenCalledTimes(1);
  expect(storage.send.mock.calls[0]![0]).toBeInstanceOf(HeadObjectCommand);
});

it("freezes each completion to a fresh public key conditional on the verified version", async () => {
  const first = await freezeOwnedAvatarUpload(userId, { storageKey: key, size: 1234 });
  const replay = await freezeOwnedAvatarUpload(userId, { storageKey: key, size: 1234 });
  expect(first.storageKey).toMatch(/^creators\/[0-9a-f-]{36}\.webp$/);
  expect(first.url).toBe("https://media.example/" + first.storageKey);
  expect(replay.storageKey).not.toBe(first.storageKey);
  const copies = storage.send.mock.calls.map(([command]) => command).filter((command) => command instanceof CopyObjectCommand);
  expect(copies).toHaveLength(2);
  expect(copies[0].input).toMatchObject({
    Key: first.storageKey, CopySource: "test-bucket/" + key,
    CopySourceIfMatch: '"version-1"', ContentType: "image/webp",
  });
  // A late client discard, including after a lost success response, cannot touch either public key.
  await discardOwnedAvatarUpload(userId, first.storageKey);
  await discardOwnedAvatarUpload(userId, key);
  const deletions = storage.send.mock.calls.map(([command]) => command).filter((command) => command instanceof DeleteObjectsCommand);
  expect(deletions).toHaveLength(1);
  expect(deletions[0].input.Delete?.Objects).toEqual([{ Key: key }]);
});

it("does not return an avatar if the staged object changed before copying", async () => {
  storage.send.mockImplementation(async (command) => {
    if (command instanceof HeadObjectCommand) return { ContentType: "image/webp", ContentLength: 1234, ETag: '"old"' };
    if (command instanceof CopyObjectCommand) throw new Error("PreconditionFailed");
    throw new Error("Unexpected deletion");
  });
  await expect(freezeOwnedAvatarUpload(userId, { storageKey: key, size: 1234 })).rejects.toThrow("PreconditionFailed");
  expect(storage.send.mock.calls.some(([command]) => command instanceof DeleteObjectsCommand)).toBe(false);
});
