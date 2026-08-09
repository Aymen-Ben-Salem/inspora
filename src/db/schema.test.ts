import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { adminAuditLogs, creators, postMedia, posts, subscribers } from "./schema";

describe("database schema", () => {
  it("keeps the content tables normalized and constrained", () => {
    const creatorsConfig = getTableConfig(creators);
    const postsConfig = getTableConfig(posts);
    const mediaConfig = getTableConfig(postMedia);

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
