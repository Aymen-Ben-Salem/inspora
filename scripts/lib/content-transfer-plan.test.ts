import { describe, expect, it } from "vitest";
import { buildContentTransferPlan, canonicalHash, D1, EXCLUDED_WEBSITE_ID, type ContentSnapshot } from "./content-transfer-plan";

function fixture() {
  const creator = { id: "creator", name: "Studio", handle: "studio", url: "https://x.com/studio", avatar_url: "https://source.example/avatar.webp", avatar_storage_provider: "r2", avatar_storage_key: "avatar.webp", created_at: "2026-01-01T00:00:00.123456+00:00", updated_at: "2026-01-01T00:00:00.123456+00:00" };
  const source = { rows: { creators: [creator], posts: [{ id: "design", slug: "design", creator_id: "creator", category: "Web", title: "Design" }], post_media: [{ id: "media", post_id: "design", position: 0, url: "https://source.example/original.mp4", storage_key: "original.mp4", video_preview: { url: "https://source.example/preview.mp4", storageKey: "preview.mp4" }, variants: [] }] } } as unknown as ContentSnapshot;
  const preview = { rows: { creators: [], posts: [], post_media: [], logos: [], logo_media: [], websites: [], website_media: [], website_sections: [], creator_username_aliases: [], design_categories: [{ name: "Web" }] } } as unknown as ContentSnapshot;
  const options = { sourceHost: "source.example", destinationHost: "preview.example" };
  return { source, preview, options };
}

describe("preview content transfer planning", () => {
  it("new-only import preserves edited existing work and imports only new work dependencies", () => {
    const f = fixture();
    f.preview.rows = buildContentTransferPlan(f.source, f.preview, f.options).desired;
    const before = structuredClone(f.preview.rows);
    f.source.rows.posts[0].title = "Later production edit";
    f.source.rows.post_media[0].id = "replacement-media";
    f.source.rows.creators[0].name = "Later profile edit";
    f.source.rows.creators.push({ ...f.source.rows.creators[0], id: "new-creator", handle: "newcreator" });
    f.source.rows.creators.push({ ...f.source.rows.creators[0], id: "unrelated-creator", handle: "unrelated" });
    f.source.rows.posts.push({ id: "new-design", slug: "new-design", creator_id: "new-creator", category: "Web", title: "New" });
    f.source.rows.post_media.push({ id: "new-media", post_id: "new-design", position: 0, url: "https://source.example/new.webp", storage_key: "new.webp" });
    const options = { ...f.options, newOnly: true };
    const plan = buildContentTransferPlan(f.source, f.preview, options);
    expect(plan.changes.map(c => [c.table,c.id,c.before])).toEqual([
      ["creators","new-creator",null], ["posts","new-design",null], ["post_media","new-media",null],
    ]);
    for (const table of ["posts","post_media","creators"]) for (const row of before[table]) {
      expect(plan.desired[table].find(r => r.id === row.id)).toEqual(row);
    }
    expect(plan.desired.creators.some(r => r.id === "unrelated-creator")).toBe(false);
    expect(plan.productionMediaKeys).toEqual(["avatar.webp","new.webp"]);
    const again = buildContentTransferPlan(f.source, { ...f.preview, rows: plan.desired }, options);
    expect(again.changes).toEqual([]);
    expect(again.aliasInserts).toEqual([]);
    expect(again.mediaKeys).toEqual([]);
  });

  it("new-only imports can credit an existing creator without editing their profile", () => {
    const f = fixture();
    f.preview.rows = buildContentTransferPlan(f.source, f.preview, f.options).desired;
    const creator = structuredClone(f.preview.rows.creators[0]);
    f.source.rows.creators[0].name = "Production changed name";
    f.source.rows.posts.push({ id: "new", slug: "new", creator_id: "creator", category: "Web" });
    const plan = buildContentTransferPlan(f.source, f.preview, { ...f.options, newOnly: true });
    expect(plan.changes.map(c=>c.id)).toEqual(["new"]);
    expect(plan.desired.creators[0]).toEqual(creator);
    f.source.rows.posts[1].creator_id = "missing";
    expect(()=>buildContentTransferPlan(f.source, f.preview, { ...f.options, newOnly: true })).toThrow(/missing source creator/);
  });

  it("new-only still rejects a new post whose slug belongs to another preview post", () => {
    const f = fixture();
    f.preview.rows.posts.push({ id: "existing", slug: "design" });
    expect(()=>buildContentTransferPlan(f.source,f.preview,{ ...f.options,newOnly:true })).toThrow(/slug collision/);
  });
  it("keeps owner-edited preview avatars out of production copy scope", () => {
    const f = fixture();
    const first = buildContentTransferPlan(f.source, f.preview, f.options);
    f.preview.rows = first.desired;
    Object.assign(f.preview.rows.creators[0], { edited_fields: ["avatarUrl"], avatar_url: "https://preview.example/owner.webp", avatar_storage_key: "owner.webp" });
    const plan = buildContentTransferPlan(f.source, f.preview, f.options);
    expect(plan.changes).toEqual([]);
    expect(plan.productionMediaKeys).not.toContain("owner.webp");
    expect(plan.preservedPreviewMediaKeys).toEqual(["owner.webp"]);
  });
  it("rejects managed media without a storage key", () => {
    const f = fixture();
    delete f.source.rows.post_media[0].storage_key;
    expect(() => buildContentTransferPlan(f.source, f.preview, f.options)).toThrow(/missing media key/);
  });
  it("preserves source identities, precise dates, nested media and yields an idempotent second plan", () => {
    const f = fixture();
    const plan = buildContentTransferPlan(f.source, f.preview, f.options);
    expect(plan.desired.posts).toEqual(f.source.rows.posts);
    expect(plan.desired.creators[0].created_at).toBe("2026-01-01T00:00:00.123456+00:00");
    expect(plan.desired.post_media[0].video_preview).toEqual({ url: "https://preview.example/preview.mp4", storageKey: "preview.mp4" });
    expect(plan.mediaKeys).toEqual(["avatar.webp", "original.mp4", "preview.mp4"]);
    const again = buildContentTransferPlan(f.source, { ...f.preview, rows: plan.desired }, f.options);
    expect(again.changes).toEqual([]);
    expect(again.aliasInserts).toEqual([]);
    expect(again.mergeDuplicate).toBe(false);
  });

  it("consolidates only D1 and preserves Auric, profile route and old aliases", () => {
    const f = fixture();
    f.source.rows.creators[0] = { ...f.source.rows.creators[0], id: D1.survivor, name: "@cabralorenzo", handle: "@cabralorenzo", url: "https://x.com/cabralorenzo" };
    f.source.rows.posts[0].creator_id = D1.survivor;
    f.preview.rows.creators.push({ ...f.source.rows.creators[0], id: D1.duplicate, username: "cabralorenzo", edited_fields: [], record_origin: "mirrored", has_owner: false, has_verified_x: false, x_profile_url: null });
    f.preview.rows.creator_username_aliases.push({ id: "alias", creator_id: D1.duplicate, username: "cabralorenzo", is_current: true }, { id: "old-alias", creator_id: D1.duplicate, username: "lorenzo_old", is_current: false });
    f.preview.rows.logos.push({ id: D1.auric, title: "Auric", creator_id: D1.duplicate, slug: "auric" });
    f.preview.rows.logo_media.push({ id: "logo-media", logo_id: D1.auric, url: "https://preview.example/auric.webp" });
    const plan = buildContentTransferPlan(f.source, f.preview, f.options);
    expect(plan.mergeDuplicate).toBe(true);
    expect(plan.desired.creators.find(r => r.id === D1.survivor)?.username).toBe("cabralorenzo");
    expect(plan.desired.logos).toEqual([{ ...f.preview.rows.logos[0], creator_id: D1.survivor }]);
    expect(plan.desired.logo_media).toEqual(f.preview.rows.logo_media);
    expect(plan.desired.creator_username_aliases.every(r => r.creator_id === D1.survivor)).toBe(true);
    expect(buildContentTransferPlan(f.source, { ...f.preview, rows: plan.desired }, f.options).changes).toEqual([]);
  });

  it("reserves existing names and preserves owned profiles and genuine new works", () => {
    const f = fixture();
    f.preview.rows.creators.push({ ...f.source.rows.creators[0], id: "unrelated", username: "studio", edited_fields: ["name"], record_origin: "user", has_owner: true, has_verified_x: true });
    f.preview.rows.creator_username_aliases.push({ id: "a", creator_id: "unrelated", username: "studio", is_current: true });
    f.preview.rows.websites.push({ id: "genuine", creator_id: "unrelated", title: "New site" }, { id: EXCLUDED_WEBSITE_ID, creator_id: "unrelated", title: "Test" });
    const plan = buildContentTransferPlan(f.source, f.preview, f.options);
    expect(plan.desired.creators.find(r => r.id === "creator")?.username).toBe("studio_2");
    expect(plan.desired.creators.find(r => r.id === "unrelated")).toEqual(f.preview.rows.creators[0]);
    expect(plan.desired.websites).toEqual(f.preview.rows.websites);
    expect(plan.protectedWorkIds).toContain("genuine");
    expect(plan.protectedWorkIds).not.toContain(EXCLUDED_WEBSITE_ID);
  });

  it.each(["unknown category", "slug collision", "preview-only design", "media identity collision", "missing media key"]) ("rejects %s without a write plan", kind => {
    const f = fixture();
    if (kind === "unknown category") f.source.rows.posts[0].category = "Unknown";
    if (kind === "slug collision") f.preview.rows.posts.push({ id: "other", slug: "design" });
    if (kind === "preview-only design") f.preview.rows.posts.push({ id: "other", slug: "other" });
    if (kind === "media identity collision") f.preview.rows.post_media.push({ ...f.source.rows.post_media[0], id: "different" });
    if (kind === "missing media key") f.source.rows.post_media[0].storage_key = "mismatch.mp4";
    expect(() => buildContentTransferPlan(f.source, f.preview, f.options)).toThrow();
  });

  it("rejects an owned D1 duplicate and an unapproved additional D1 work reference", () => {
    const f = fixture();
    f.source.rows.creators.push({ ...f.source.rows.creators[0], id: D1.survivor });
    f.preview.rows.creators.push({ ...f.source.rows.creators[0], id: D1.duplicate, username: "cabralorenzo", has_owner: true });
    expect(() => buildContentTransferPlan(f.source, f.preview, f.options)).toThrow(/ownership/);
    f.preview.rows.creators[0].has_owner = false;
    f.preview.rows.websites.push({ id: "new", creator_id: D1.duplicate });
    expect(() => buildContentTransferPlan(f.source, f.preview, f.options)).toThrow(/reference/);
  });

  it("canonical hashes ignore object key order but preserve ordered arrays", () => {
    expect(canonicalHash({ a: 1, b: 2 })).toBe(canonicalHash({ b: 2, a: 1 }));
    expect(canonicalHash([1, 2])).not.toBe(canonicalHash([2, 1]));
  });
});
