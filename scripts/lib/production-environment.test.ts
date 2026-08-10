import { describe, expect, it } from "vitest";

import { parseExecutionOptions } from "./production-environment";

describe("production media command options", () => {
  it("is dry-run by default", () => {
    expect(parseExecutionOptions([])).toEqual({ execute: false, limit: undefined });
  });

  it("requires an explicit execute flag and accepts a positive limit", () => {
    expect(parseExecutionOptions(["--execute", "--limit=2"])).toEqual({
      execute: true,
      limit: 2,
    });
  });

  it("rejects unsafe or unknown arguments", () => {
    expect(() => parseExecutionOptions(["--limit=0"])).toThrow();
    expect(() => parseExecutionOptions(["--force"])).toThrow();
  });
});
