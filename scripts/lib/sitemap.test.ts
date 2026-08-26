import { describe, expect, it } from "vitest";

import { renderSitemap } from "./sitemap";

describe("renderSitemap", () => {
  it("renders the canonical homepage and post URLs", () => {
    const xml = renderSitemap(["first-project", "second-project"]);

    expect(xml).toContain("<loc>https://www.inspora.design/</loc>");
    expect(xml).toContain(
      "<loc>https://www.inspora.design/posts/first-project</loc>",
    );
    expect(xml).toContain(
      "<loc>https://www.inspora.design/posts/second-project</loc>",
    );
  });

  it("escapes unexpected XML characters defensively", () => {
    expect(renderSitemap(["project&draft"])).toContain(
      "https://www.inspora.design/posts/project&amp;draft",
    );
  });
});
