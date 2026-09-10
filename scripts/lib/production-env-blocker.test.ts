import {
  mkdtempSync,
  rmSync,
  rmdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

import { describe, expect, it } from "vitest";

describe("production environment file blocker", () => {
  it("prevents a child process from reading production config", () => {
    const fixtureDirectory = mkdtempSync(join(tmpdir(), "inspora-env-blocker-"));
    const developmentPath = join(fixtureDirectory, ".env.local");
    const productionLocalPath = join(fixtureDirectory, ".env.production.local");
    writeFileSync(developmentPath, "SAFE_FIXTURE=true\n", "utf8");
    writeFileSync(productionLocalPath, "FORBIDDEN_LOCAL=true\n", "utf8");

    try {
      const blocker = resolve("scripts", "block-production-environment.cjs");
      const script = `
        const { loadEnvConfig } = require("@next/env");
        const result = loadEnvConfig(${JSON.stringify(fixtureDirectory)}, false, console, true);
        process.stdout.write(JSON.stringify(result.loadedEnvFiles.map((file) => file.path)));
      `;

      const output = execFileSync(process.execPath, ["-e", script], {
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_OPTIONS: `--require=${blocker}`,
          NODE_ENV: "production",
          __NEXT_PROCESSED_ENV: undefined,
        },
        windowsHide: true,
      });
      expect(JSON.parse(output)).toEqual([".env.local"]);
    } finally {
      rmSync(developmentPath);
      rmSync(productionLocalPath);
      rmdirSync(fixtureDirectory);
    }
  });
});
