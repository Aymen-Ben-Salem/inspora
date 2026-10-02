import { describe, expect, it } from "vitest";

import { renderSitemap } from "./sitemap";

describe("renderSitemap", () => {
  it('includes canonical creator profiles once alongside archives and designs',()=>{
    const xml=renderSitemap(['first-project'],['cabralorenzo','cabralorenzo']);
    expect(xml.match(/<loc>https:\/\/www.inspora.design\/creators\/cabralorenzo<\/loc>/g)).toHaveLength(1);
    expect(xml).not.toContain('r2.dev');
  });
  it("renders the canonical homepage, logos page, info page, and post URLs", () => {
    const xml = renderSitemap(["first-project", "second-project"]);

    expect(xml).toContain("<loc>https://www.inspora.design/</loc>");
    expect(xml).toContain("<loc>https://www.inspora.design/info</loc>");
    expect(xml).toContain("<loc>https://www.inspora.design/logos</loc>");
    expect(xml).toContain("<loc>https://www.inspora.design/websites</loc>");
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
