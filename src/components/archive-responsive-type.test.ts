import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const archiveControlFiles: Array<[string, string[]]> = [
  ["src/components/archive-filter-menu.tsx", ["archive-control-type"]],
  ["src/components/auth/public-auth-controls-client.tsx", ["archive-copy-type"]],
  ["src/components/auth/public-auth-controls.tsx", ["archive-copy-type"]],
  ["src/components/category-filter.tsx", ["archive-control-type"]],
  [
    "src/components/logos/logo-archive.tsx",
    ["archive-search-type", "archive-switch-type"],
  ],
  [
    "src/components/site-navbar-client.tsx",
    ["archive-copy-type", "archive-menu-type"],
  ],
  ["src/components/view-filter.tsx", ["archive-control-type"]],
  ["src/components/websites/website-archive.tsx", ["archive-search-type"]],
];

describe("archive responsive typography", () => {
  it("does not route CSS size variables through ambiguous Tailwind text utilities", () => {
    for (const [file] of archiveControlFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");

      expect(source, file).not.toMatch(/text-\[var\(--archive-[^)]+-size\)\]/);
    }
  });

  it("uses element-safe type classes at every archive control call site", () => {
    for (const [file, classNames] of archiveControlFiles) {
      const source = readFileSync(join(process.cwd(), file), "utf8");

      for (const className of classNames) {
        expect(source, `${file}: ${className}`).toContain(className);
      }
    }
  });

  it("defines element-safe classes for every archive type scale", () => {
    const styles = readFileSync(
      join(process.cwd(), "src/app/globals.css"),
      "utf8",
    );

    for (const [className, variable] of [
      ["archive-copy-type", "archive-copy-size"],
      ["archive-control-type", "archive-control-size"],
      ["archive-menu-type", "archive-menu-size"],
      ["archive-search-type", "archive-search-size"],
      ["archive-switch-type", "archive-switch-size"],
    ]) {
      expect(styles).toContain(
        `.${className} {\n  font-size: var(--${variable});\n}`,
      );
    }
  });
});
