import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import {
  adminAuditLogs,
  creators,
  logoMedia,
  logos,
  postMedia,
  posts,
  sponsors,
  subscribers,
  websiteMedia,
  websites,
  websiteSections,
} from "./schema";

describe("database schema", () => {
  it("keeps the content tables normalized and constrained", () => {
    const creatorsConfig = getTableConfig(creators);
    const postsConfig = getTableConfig(posts);
    const mediaConfig = getTableConfig(postMedia);
    const sponsorsConfig = getTableConfig(sponsors);
    const logosConfig = getTableConfig(logos);
    const logoMediaConfig = getTableConfig(logoMedia);
    const websitesConfig = getTableConfig(websites);
    const websiteMediaConfig = getTableConfig(websiteMedia);
    const websiteSectionsConfig = getTableConfig(websiteSections);

    expect(creatorsConfig.name).toBe("creators");
    expect(creatorsConfig.indexes).toHaveLength(1);
    expect(creatorsConfig.checks).toHaveLength(2);
    expect(postsConfig.name).toBe("posts");
    expect(postsConfig.indexes).toHaveLength(4);
    expect(postsConfig.checks).toHaveLength(6);
    expect(postsConfig.foreignKeys).toHaveLength(1);
    expect(mediaConfig.foreignKeys).toHaveLength(1);
    expect(mediaConfig.indexes).toHaveLength(1);
    expect(mediaConfig.checks).toHaveLength(6);
    expect(mediaConfig.columns.map((column) => column.name)).toContain("video_preview");
    expect(sponsorsConfig.name).toBe("sponsors");
    expect(sponsorsConfig.checks).toHaveLength(6);
    expect(sponsorsConfig.columns.map((column) => column.name)).toContain(
      "media_video_preview",
    );
    expect(logosConfig.name).toBe("logos");
    expect(logosConfig.indexes).toHaveLength(3);
    expect(logosConfig.checks).toHaveLength(8);
    expect(logosConfig.foreignKeys).toHaveLength(1);
    expect(logoMediaConfig.name).toBe("logo_media");
    expect(logoMediaConfig.indexes).toHaveLength(1);
    expect(logoMediaConfig.checks).toHaveLength(3);
    expect(logoMediaConfig.foreignKeys).toHaveLength(1);
    expect(websitesConfig.name).toBe("websites");
    expect(websitesConfig.indexes).toHaveLength(3);
    expect(websitesConfig.columns.map((column) => column.name)).toContain(
      "is_featured",
    );
    expect(websitesConfig.checks).toHaveLength(6);
    expect(websitesConfig.foreignKeys).toHaveLength(1);
    expect(websiteMediaConfig.name).toBe("website_media");
    expect(websiteMediaConfig.indexes).toHaveLength(1);
    expect(websiteMediaConfig.checks).toHaveLength(5);
    expect(websiteMediaConfig.foreignKeys).toHaveLength(1);
    expect(websiteSectionsConfig.name).toBe("website_sections");
    expect(websiteSectionsConfig.indexes).toHaveLength(1);
    expect(websiteSectionsConfig.checks).toHaveLength(6);
    expect(websiteSectionsConfig.foreignKeys).toHaveLength(1);
  });

  it("enforces one normalized subscriber row per email", () => {
    const subscriberConfig = getTableConfig(subscribers);

    expect(subscriberConfig.indexes).toHaveLength(2);
    expect(subscriberConfig.checks).toHaveLength(3);
  });

  it("retains constrained audit records independently of deleted resources", () => {
    const auditConfig = getTableConfig(adminAuditLogs);

    expect(auditConfig.foreignKeys).toHaveLength(0);
    expect(auditConfig.indexes).toHaveLength(2);
    expect(auditConfig.checks).toHaveLength(3);
  });
});
