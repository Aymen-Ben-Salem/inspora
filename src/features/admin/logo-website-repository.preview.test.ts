import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ rollbackNext: false }));

vi.mock("server-only", () => ({}));
vi.mock("@/db/write-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/db/write-client")>();
  return {
    ...actual,
    withWriteTransaction: <T>(
      work: (tx: import("@/db/write-client").WriteTx) => Promise<T>,
    ) => actual.withWriteTransaction(async (tx) => {
      const result = await work(tx);
      if (external.rollbackNext) {
        external.rollbackNext = false;
        throw new Error("Forced failure after identity and work writes");
      }
      return result;
    }),
  };
});

import {
  adminAuditLogs,
  creators,
  creatorUsernameAliases,
  logoMedia,
  logos,
  websiteMedia,
  websites,
  websiteSections,
} from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import { createAdminLogo, updateAdminLogo } from "./logos-repository";
import type { AdminLogoInput, AdminWebsiteInput } from "./types";
import {
  createAdminWebsite,
  updateAdminWebsite,
} from "./websites-repository";

const enabled =
  process.env.RUN_CREATOR_IDENTITY_INTEGRATION === "1" &&
  process.env.DATA_ENVIRONMENT === "preview";

describe.skipIf(!enabled)("logo and website attribution transactions in guarded preview rows", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const workIds: string[] = [];
  const creatorIds: string[] = [];
  const principal = { userId: "ticket-07-admin" };

  const logoInput = (overrides: Partial<AdminLogoInput> = {}): AdminLogoInput => ({
    slug: `ticket-07-logo-${suffix}`,
    title: "Transactional logo",
    kind: "logo",
    creator: {
      name: "Logo creator",
      username: `t07_logo_${suffix}`,
      avatarUrl: "/brand/default-avatar.svg",
    },
    description: "Ticket 07 fixture",
    industry: "Technology",
    colors: ["Black"],
    styles: ["Minimal"],
    shape: "wordmark",
    sourceUrl: "https://example.com/logo",
    status: "draft",
    media: {
      url: "/ticket-07-logo.webp",
      storageProvider: "r2",
      storageKey: `logos/ticket-07-${suffix}.webp`,
      alt: "Ticket 07 logo",
      width: 800,
      height: 600,
    },
    ...overrides,
  });

  const websiteInput = (
    overrides: Partial<AdminWebsiteInput> = {},
  ): AdminWebsiteInput => ({
    slug: `ticket-07-website-${suffix}`,
    title: "Transactional website",
    tagline: "Ticket 07",
    creator: {
      name: "Website creator",
      username: `t07_web_${suffix}`,
      avatarUrl: "/brand/default-avatar.svg",
    },
    description: "Ticket 07 fixture",
    categories: ["Portfolio"],
    themes: ["Minimal"],
    colors: ["White"],
    sourceUrl: "https://example.com/website",
    isFeatured: false,
    status: "draft",
    media: [
      {
        role: "recording",
        url: "/ticket-07.mp4",
        storageProvider: "r2",
        storageKey: `websites/ticket-07-${suffix}.mp4`,
        posterUrl: "/ticket-07-poster.webp",
        posterStorageKey: `websites/ticket-07-poster-${suffix}.webp`,
        alt: "Recording",
        width: 1440,
        height: 900,
      },
      {
        role: "favicon",
        url: "/ticket-07-favicon.png",
        storageProvider: "r2",
        storageKey: `websites/ticket-07-favicon-${suffix}.png`,
        alt: "Favicon",
        width: 32,
        height: 32,
      },
    ],
    sections: [{
      id: randomUUID(),
      label: "Hero",
      alt: "Hero",
      url: "/ticket-07-section.webp",
      storageProvider: "r2",
      storageKey: `websites/ticket-07-section-${suffix}.webp`,
      width: 1440,
      height: 900,
      position: 0,
    }],
    ...overrides,
  });

  afterAll(async () => {
    await withWriteTransaction(async (tx) => {
      if (workIds.length) {
        await tx.delete(adminAuditLogs).where(inArray(adminAuditLogs.resourceId, workIds));
        await tx.delete(logos).where(inArray(logos.id, workIds));
        await tx.delete(websites).where(inArray(websites.id, workIds));
      }
      if (creatorIds.length) {
        await tx.delete(creators).where(inArray(creators.id, creatorIds));
      }
    });
  });

  it("commits logo creation/editing and preserves locked mirrored attribution", async () => {
    const created = await createAdminLogo(logoInput(), principal);
    workIds.push(created.id);
    const [logo] = await withWriteTransaction((tx) =>
      tx.select().from(logos).where(eq(logos.id, created.id)),
    );
    creatorIds.push(logo.creatorId);

    await updateAdminLogo(created.id, logoInput({
      slug: `ticket-07-logo-edited-${suffix}`,
      creator: {
        id: logo.creatorId,
        name: "Edited logo creator",
        username: `t07_logo_edit_${suffix}`,
        avatarUrl: "/edited.svg",
      },
    }), principal);

    const mirroredId = randomUUID();
    creatorIds.push(mirroredId);
    await withWriteTransaction(async (tx) => {
      await tx.insert(creators).values({
        id: mirroredId,
        name: "Protected mirror",
        username: `t07_logo_m_${suffix}`,
        avatarUrl: "/mirror.svg",
        recordOrigin: "mirrored",
      });
      await tx.insert(creatorUsernameAliases).values({
        creatorId: mirroredId,
        username: `t07_logo_m_${suffix}`,
        isCurrent: true,
      });
    });
    const attributed = await createAdminLogo(logoInput({
      slug: `ticket-07-logo-mirror-${suffix}`,
      creator: {
        id: mirroredId,
        name: "Attempted edit",
        username: `t07_logo_changed_${suffix}`,
        avatarUrl: "/changed.svg",
      },
    }), principal);
    workIds.push(attributed.id);

    await withWriteTransaction(async (tx) => {
      const [creator] = await tx.select().from(creators).where(eq(creators.id, logo.creatorId));
      expect(creator).toMatchObject({ name: "Edited logo creator", username: `t07_logo_edit_${suffix}` });
      expect(await tx.select().from(logoMedia).where(eq(logoMedia.logoId, created.id))).toHaveLength(1);
      const [mirror] = await tx.select().from(creators).where(eq(creators.id, mirroredId));
      expect(mirror).toMatchObject({ name: "Protected mirror", username: `t07_logo_m_${suffix}` });
      const [mirroredLogo] = await tx.select().from(logos).where(eq(logos.id, attributed.id));
      expect(mirroredLogo.creatorId).toBe(mirroredId);
    });
  }, 60_000);

  it("rolls back logo create and update identity, work, media, and audit writes", async () => {
    const createInput = logoInput({
      slug: `ticket-07-logo-rollback-create-${suffix}`,
      creator: { name: "Rollback logo", username: `t07_lrc_${suffix}`, avatarUrl: "/avatar.svg" },
    });
    external.rollbackNext = true;
    await expect(createAdminLogo(createInput, principal)).rejects.toThrow("Forced failure");
    await withWriteTransaction(async (tx) => {
      expect(await tx.select().from(creators).where(eq(creators.username, `t07_lrc_${suffix}`))).toHaveLength(0);
      expect(await tx.select().from(creatorUsernameAliases).where(eq(creatorUsernameAliases.username, `t07_lrc_${suffix}`))).toHaveLength(0);
      expect(await tx.select().from(logos).where(eq(logos.slug, createInput.slug))).toHaveLength(0);
      expect(await tx.select().from(logoMedia).where(eq(logoMedia.storageKey, createInput.media.storageKey!))).toHaveLength(0);
    });

    const created = await createAdminLogo(logoInput({
      slug: `ticket-07-logo-rollback-update-${suffix}`,
      creator: { name: "Original logo", username: `t07_lru_${suffix}`, avatarUrl: "/avatar.svg" },
    }), principal);
    workIds.push(created.id);
    const [before] = await withWriteTransaction((tx) => tx.select().from(logos).where(eq(logos.id, created.id)));
    creatorIds.push(before.creatorId);
    external.rollbackNext = true;
    await expect(updateAdminLogo(created.id, logoInput({
      slug: `ticket-07-logo-must-not-stick-${suffix}`,
      creator: { id: before.creatorId, name: "Must not stick", username: `t07_lno_${suffix}`, avatarUrl: "/changed.svg" },
      media: { url: "/changed.webp", storageKey: `logos/changed-${suffix}.webp`, alt: "Changed", width: 1, height: 1 },
    }), principal)).rejects.toThrow("Forced failure");
    await withWriteTransaction(async (tx) => {
      const [saved] = await tx.select().from(logos).where(eq(logos.id, created.id));
      const [creator] = await tx.select().from(creators).where(eq(creators.id, before.creatorId));
      expect(saved.slug).toBe(`ticket-07-logo-rollback-update-${suffix}`);
      expect(creator).toMatchObject({ name: "Original logo", username: `t07_lru_${suffix}` });
      expect(await tx.select().from(creatorUsernameAliases).where(eq(creatorUsernameAliases.username, `t07_lno_${suffix}`))).toHaveLength(0);
      expect(await tx.select().from(adminAuditLogs).where(and(eq(adminAuditLogs.resourceId, created.id), eq(adminAuditLogs.action, "logo.updated")))).toHaveLength(0);
    });
  }, 60_000);

  it("commits website creation/editing and preserves locked mirrored attribution", async () => {
    const created = await createAdminWebsite(websiteInput(), principal);
    workIds.push(created.id);
    const [website] = await withWriteTransaction((tx) => tx.select().from(websites).where(eq(websites.id, created.id)));
    creatorIds.push(website.creatorId);
    await updateAdminWebsite(created.id, websiteInput({
      slug: `ticket-07-website-edited-${suffix}`,
      creator: { id: website.creatorId, name: "Edited website creator", username: `t07_web_edit_${suffix}`, avatarUrl: "/edited.svg" },
    }), principal);

    const mirroredId = randomUUID();
    creatorIds.push(mirroredId);
    await withWriteTransaction(async (tx) => {
      await tx.insert(creators).values({ id: mirroredId, name: "Protected website mirror", username: `t07_web_m_${suffix}`, avatarUrl: "/mirror.svg", recordOrigin: "mirrored" });
      await tx.insert(creatorUsernameAliases).values({ creatorId: mirroredId, username: `t07_web_m_${suffix}`, isCurrent: true });
    });
    const attributed = await createAdminWebsite(websiteInput({
      slug: `ticket-07-website-mirror-${suffix}`,
      creator: { id: mirroredId, name: "Attempted edit", username: `t07_web_changed_${suffix}`, avatarUrl: "/changed.svg" },
    }), principal);
    workIds.push(attributed.id);

    await withWriteTransaction(async (tx) => {
      const [creator] = await tx.select().from(creators).where(eq(creators.id, website.creatorId));
      expect(creator).toMatchObject({ name: "Edited website creator", username: `t07_web_edit_${suffix}` });
      expect(await tx.select().from(websiteMedia).where(eq(websiteMedia.websiteId, created.id))).toHaveLength(2);
      expect(await tx.select().from(websiteSections).where(eq(websiteSections.websiteId, created.id))).toHaveLength(1);
      const [mirror] = await tx.select().from(creators).where(eq(creators.id, mirroredId));
      expect(mirror).toMatchObject({ name: "Protected website mirror", username: `t07_web_m_${suffix}` });
      const [mirroredWebsite] = await tx.select().from(websites).where(eq(websites.id, attributed.id));
      expect(mirroredWebsite.creatorId).toBe(mirroredId);
    });
  }, 60_000);

  it("rolls back website create and update identity, work, media, sections, and audit writes", async () => {
    const createInput = websiteInput({
      slug: `ticket-07-website-rollback-create-${suffix}`,
      creator: { name: "Rollback website", username: `t07_wrc_${suffix}`, avatarUrl: "/avatar.svg" },
    });
    external.rollbackNext = true;
    await expect(createAdminWebsite(createInput, principal)).rejects.toThrow("Forced failure");
    await withWriteTransaction(async (tx) => {
      expect(await tx.select().from(creators).where(eq(creators.username, `t07_wrc_${suffix}`))).toHaveLength(0);
      expect(await tx.select().from(creatorUsernameAliases).where(eq(creatorUsernameAliases.username, `t07_wrc_${suffix}`))).toHaveLength(0);
      expect(await tx.select().from(websites).where(eq(websites.slug, createInput.slug))).toHaveLength(0);
      expect(await tx.select().from(websiteMedia).where(eq(websiteMedia.storageKey, createInput.media[0]!.storageKey!))).toHaveLength(0);
      expect(await tx.select().from(websiteSections).where(eq(websiteSections.id, createInput.sections[0]!.id))).toHaveLength(0);
    });

    const created = await createAdminWebsite(websiteInput({
      slug: `ticket-07-website-rollback-update-${suffix}`,
      creator: { name: "Original website", username: `t07_wru_${suffix}`, avatarUrl: "/avatar.svg" },
    }), principal);
    workIds.push(created.id);
    const [before] = await withWriteTransaction((tx) => tx.select().from(websites).where(eq(websites.id, created.id)));
    creatorIds.push(before.creatorId);
    external.rollbackNext = true;
    await expect(updateAdminWebsite(created.id, websiteInput({
      slug: `ticket-07-website-must-not-stick-${suffix}`,
      creator: { id: before.creatorId, name: "Must not stick", username: `t07_wno_${suffix}`, avatarUrl: "/changed.svg" },
    }), principal)).rejects.toThrow("Forced failure");
    await withWriteTransaction(async (tx) => {
      const [saved] = await tx.select().from(websites).where(eq(websites.id, created.id));
      const [creator] = await tx.select().from(creators).where(eq(creators.id, before.creatorId));
      expect(saved.slug).toBe(`ticket-07-website-rollback-update-${suffix}`);
      expect(creator).toMatchObject({ name: "Original website", username: `t07_wru_${suffix}` });
      expect(await tx.select().from(creatorUsernameAliases).where(eq(creatorUsernameAliases.username, `t07_wno_${suffix}`))).toHaveLength(0);
      expect(await tx.select().from(adminAuditLogs).where(and(eq(adminAuditLogs.resourceId, created.id), eq(adminAuditLogs.action, "website.updated")))).toHaveLength(0);
    });
  }, 60_000);
});
