import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertEnvironment: vi.fn(),
  connect: vi.fn(),
  drizzle: vi.fn(),
  end: vi.fn(),
  release: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@neondatabase/serverless", () => ({
  Pool: class MockPool {
    connect = mocks.connect;
    end = mocks.end;
  },
}));
vi.mock("drizzle-orm/neon-serverless", () => ({ drizzle: mocks.drizzle }));
vi.mock("../../scripts/lib/environment-fingerprint", () => ({
  assertDataOperationEnvironment: mocks.assertEnvironment,
  runtimeDataEnvironmentFromValues: vi.fn(() => ({ dataEnvironment: "preview" })),
}));
vi.mock("./client", () => ({
  DatabaseConfigurationError: class DatabaseConfigurationError extends Error {},
}));
vi.mock("./schema", () => ({}));

import { withWriteTransaction } from "./write-client";

describe("interactive write client", () => {
  const previousDatabaseUrl = process.env.DATABASE_URL;

  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://preview.example/test";
    mocks.release.mockReset();
    mocks.end.mockReset().mockResolvedValue(undefined);
    mocks.connect.mockReset().mockResolvedValue({ release: mocks.release });
    mocks.drizzle.mockReset().mockReturnValue({
      transaction: async (work: (tx: object) => Promise<unknown>) =>
        work({ kind: "transaction" }),
    });
  });

  afterEach(() => {
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it("runs one transaction after the environment guard and releases its connection", async () => {
    await expect(
      withWriteTransaction(async (tx) => tx as unknown as { kind: string }),
    ).resolves.toEqual({ kind: "transaction" });

    expect(mocks.assertEnvironment).toHaveBeenCalledOnce();
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.end).toHaveBeenCalledOnce();
  });

  it("releases the connection when the transaction fails", async () => {
    await expect(
      withWriteTransaction(async () => {
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");

    expect(mocks.release).toHaveBeenCalledOnce();
    expect(mocks.end).toHaveBeenCalledOnce();
  });
});
