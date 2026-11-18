import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { inArray, sql } from "drizzle-orm";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, cacheLife: vi.fn(), cacheTag: vi.fn(), revalidatePath: vi.fn(), updateTag: vi.fn() }));
// Fixtures use local paths; the R2 existence check is not under test here.
vi.mock("@/storage/r2", async importOriginal => ({ ...await importOriginal<object>(), assertR2StorageKeysExist: async () => undefined }));
import { adminAuditLogs, creators, logos, posts, websites, workEditorialNotes } from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import { loadPreviewEnvironment } from "../../../scripts/lib/preview-environment";
import { editorialContentHash, reviewedEditorialEntries } from "../../../tools/inspora-mcp/editorial-notes.mjs";
import { editorialHashFromInput } from "./editorial-hash";
import { editorialNoteStatus, saveEditorialReview } from "./editorial-review";
import { createAdminPost, getAdminPostById, updateAdminPost } from "./posts-repository";
import { createAdminLogo, getAdminLogoById, updateAdminLogo } from "./logos-repository";
import { createAdminWebsite, getAdminWebsiteById } from "./websites-repository";
import type { AdminLogoInput, AdminPostInput, AdminWebsiteInput } from "./types";

const notes = { scope: "component" as const, visualNotes: "A fixture panel with a single dark control on a pale ground.", typography: null, typographyIsSubject: false };

it.skipIf(process.env.EDITORIAL_DATABASE_TEST !== "1")("saved note hashes match the MCP catalog view, survive hash-neutral edits and go stale on content edits", async () => {
  loadPreviewEnvironment(); // Approved Preview fingerprint before any write.
  for (const [key, value] of Object.entries(parse(readFileSync(".env.preview.local")))) vi.stubEnv(key, value);
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const principal = { userId: `editorial-hash-${suffix}` };
  const creator = (tag: string) => ({ name: `Editorial hash ${tag}`, username: `eh_${tag}_${suffix}`, avatarUrl: "/brand/default-avatar.svg" });
  const post: AdminPostInput = { slug: `editorial-hash-post-${suffix}`, title: "Editorial hash fixture", creator: creator("p"), description: "Fixture design.", category: "Product",
    industries: ["Software"], colors: ["Black"], styles: ["Minimal"], sourceUrl: "https://example.com/design", isFeatured: false, status: "published",
    media: [{ type: "image", url: "/fixtures/editorial-hash.webp", alt: "Fixture image", width: 1200, height: 900 }, { type: "video", url: "/fixtures/editorial-hash.mp4", posterUrl: "/fixtures/editorial-hash-poster.webp", alt: "", width: 1280, height: 720 }] };
  const logo: AdminLogoInput = { slug: `editorial-hash-logo-${suffix}`, title: "Editorial hash logo", kind: "icon", creator: creator("l"), description: "Fixture icon.", industry: "Technology",
    colors: ["Black"], styles: ["Minimal"], shape: "Symbol", sourceUrl: "https://example.com/logo", status: "published", media: { url: "/fixtures/editorial-hash-logo.webp", alt: "Fixture logo", width: 800, height: 800 } };
  const website: AdminWebsiteInput = { slug: `editorial-hash-site-${suffix}`, title: "Editorial hash site", tagline: "Fixture", creator: creator("w"), description: "Fixture website.",
    categories: ["Portfolio"], themes: ["Minimal"], colors: ["White"], technologies: ["React"], sourceUrl: "https://example.com/site", isFeatured: false, status: "published",
    media: [{ role: "recording", url: "/fixtures/editorial-hash.mp4", posterUrl: "/fixtures/editorial-hash-poster.webp", alt: "Fixture recording", width: 1440, height: 900,
      videoPreview: { url: "/fixtures/editorial-hash-preview.mp4", storageKey: `fixtures/editorial-hash-preview-${suffix}.mp4`, width: 720, height: 450, bytes: 1000, format: "mp4" } },
    { role: "favicon", url: "/fixtures/editorial-hash-favicon.png", alt: "Fixture favicon", width: 64, height: 64 }] };
  const ids: string[] = [];
  try {
    const created = [await createAdminPost(post, principal), await createAdminLogo(logo, principal), await createAdminWebsite(website, principal)];
    ids.push(...created.map(item => item.id));
    const query = readFileSync("tools/inspora-mcp/capture.sql", "utf8").replace(/SELECT \* FROM works ORDER BY kind,id\s*$/, `SELECT * FROM works WHERE id IN (${ids.map(id => `'${id}'`).join(",")})`);
    const view = async () => withWriteTransaction(async tx => {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
      const result = await tx.execute(sql.raw(query)) as unknown as { rows: Record<string, unknown>[] };
      // Same columns as the production-only inspora_mcp_reviewed_notes view; reviewedEditorialEntries applies its id/kind join.
      const noteRows = await tx.execute(sql.raw(`SELECT work_id,kind,content_hash,notes,evidence,reviewed_at FROM public.work_editorial_notes WHERE work_id IN (${ids.map(id => `'${id}'`).join(",")})`)) as unknown as { rows: Record<string, unknown>[] };
      return { rows: JSON.parse(JSON.stringify(result.rows)), notes: JSON.parse(JSON.stringify(noteRows.rows)) };
    });
    const before = await view();
    expect(before.rows).toHaveLength(3);
    const inputs = { [ids[0]]: ["design", post], [ids[1]]: ["icon", logo], [ids[2]]: ["website", website]} as const;
    for (const row of before.rows) {
      const [kind, input] = inputs[row.id as string];
      expect(editorialHashFromInput(kind, input), `${kind} save hash`).toBe(editorialContentHash(row));
    }
    // The edit page reads the stored record; its hash must agree too.
    expect(editorialHashFromInput("design", (await getAdminPostById(ids[0]))!)).toBe(editorialHashFromInput("design", post));
    expect(editorialHashFromInput("icon", (await getAdminLogoById(ids[1]))!)).toBe(editorialHashFromInput("icon", logo));
    expect(editorialHashFromInput("website", (await getAdminWebsiteById(ids[2]))!)).toBe(editorialHashFromInput("website", website));
    const review = { jobId: randomUUID(), notes, evidence: ["a".repeat(64)] };
    await withWriteTransaction(async tx => {
      await saveEditorialReview(tx, ids[0], "design", post, principal.userId, review);
      await saveEditorialReview(tx, ids[1], "icon", logo, principal.userId, review);
      await saveEditorialReview(tx, ids[2], "website", website, principal.userId, review);
    });
    const saved = await view();
    expect(reviewedEditorialEntries(saved.rows, saved.notes).map(entry => String(entry.id)).sort()).toEqual([...ids].sort());
    expect(await editorialNoteStatus("design", ids[0], (await getAdminPostById(ids[0]))!)).toBe("current");

    const attributed = (record: { creator: { id: string; name: string; username?: string } }) => ({ id: record.creator.id, name: record.creator.name, username: record.creator.username ?? "", avatarUrl: "/brand/default-avatar.svg" });
    const savedPost = { ...post, creator: attributed((await getAdminPostById(ids[0]))!) };
    expect((await updateAdminPost(ids[0], { ...savedPost, slug: `${post.slug}-renamed` }, principal)).notesStale).toBe(false);
    expect((await updateAdminPost(ids[0], { ...savedPost, slug: `${post.slug}-renamed`, description: "Edited fixture." }, principal)).notesStale).toBe(true);
    expect(await editorialNoteStatus("design", ids[0], (await getAdminPostById(ids[0]))!)).toBe("stale");
    expect((await updateAdminLogo(ids[1], { ...logo, creator: attributed((await getAdminLogoById(ids[1]))!), kind: "logo" }, principal)).notesStale).toBe(true);
    const edited = await view();
    expect(reviewedEditorialEntries(edited.rows, edited.notes).map(entry => String(entry.id))).toEqual([ids[2]]);
    expect(edited.notes).toHaveLength(3); // Rows are kept, never silently deleted.
  } finally {
    await withWriteTransaction(async tx => {
      if (ids.length) {
        await tx.delete(workEditorialNotes).where(inArray(workEditorialNotes.workId, ids));
        await tx.delete(adminAuditLogs).where(inArray(adminAuditLogs.resourceId, ids));
        await tx.delete(posts).where(inArray(posts.id, ids));
        await tx.delete(logos).where(inArray(logos.id, ids));
        await tx.delete(websites).where(inArray(websites.id, ids));
      }
      await tx.delete(creators).where(sql`${creators.username} like ${`eh\\_%\\_${suffix}`}`);
    });
    vi.unstubAllEnvs();
  }
}, 120000);
