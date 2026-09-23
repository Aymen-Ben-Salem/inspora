import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";

const external = vi.hoisted(() => ({ rollbackNext: false }));

vi.mock("server-only", () => ({}));
vi.mock("@/db/write-client", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/db/write-client")>();
  return {
    ...actual,
    withWriteTransaction: <T>(
      work: (tx: import("@/db/write-client").WriteTx) => Promise<T>,
    ) =>
      actual.withWriteTransaction(async (tx) => {
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
  postMedia,
  posts,
} from "@/db/schema";
import { withWriteTransaction } from "@/db/write-client";
import type { AdminPostInput } from "./types";
import { createAdminPost, updateAdminPost } from "./posts-repository";

const enabled =
  process.env.RUN_CREATOR_IDENTITY_INTEGRATION === "1" &&
  process.env.DATA_ENVIRONMENT === "preview";

describe.skipIf(!enabled)("design attribution transaction in guarded preview rows", () => {
  const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
  const postIds: string[] = [];
  const creatorIds: string[] = [];

  const input = (overrides: Partial<AdminPostInput> = {}): AdminPostInput => ({
    slug: `ticket-06-${suffix}`,
    title: "Transactional design",
    creator: {
      name: "Transactional creator",
      username: `ticket06_${suffix}`,
      avatarUrl: "/brand/default-avatar.svg",
    },
    description: "Ticket 06 fixture",
    category: "Branding",
    industries: ["Technology"],
    colors: ["Black"],
    styles: ["Minimal"],
    sourceUrl: "https://example.com/design",
    isFeatured: false,
    status: "draft",
    media: [
      {
        type: "image",
        url: "/ticket-06.webp",
        storageProvider: "r2",
        storageKey: `posts/ticket-06-${suffix}.webp`,
        alt: "Ticket 06 fixture",
        width: 1200,
        height: 900,
      },
    ],
    ...overrides,
  });

  afterAll(async () => {
    await withWriteTransaction(async (tx) => {
      if (postIds.length) {
        await tx.delete(adminAuditLogs).where(inArray(adminAuditLogs.resourceId, postIds));
        await tx.delete(posts).where(inArray(posts.id, postIds));
      }
      if (creatorIds.length) {
        await tx.delete(creators).where(inArray(creators.id, creatorIds));
      }
    });
  });

  it("commits embedded creator creation, attribution, media, and audit together", async () => {
    const created = await createAdminPost(input(), { userId: "ticket-06-admin" });
    postIds.push(created.id);

    await withWriteTransaction(async (tx) => {
      const [post] = await tx.select().from(posts).where(eq(posts.id, created.id));
      expect(post).toMatchObject({
        slug: `ticket-06-${suffix}`,
        createdBy: "ticket-06-admin",
      });
      creatorIds.push(post.creatorId);

      const [creator] = await tx
        .select()
        .from(creators)
        .where(eq(creators.id, post.creatorId));
      expect(creator).toMatchObject({
        name: "Transactional creator",
        username: `ticket06_${suffix}`,
      });
      expect(
        await tx
          .select()
          .from(creatorUsernameAliases)
          .where(eq(creatorUsernameAliases.creatorId, post.creatorId)),
      ).toEqual([
        expect.objectContaining({ username: `ticket06_${suffix}`, isCurrent: true }),
      ]);
      expect(await tx.select().from(postMedia).where(eq(postMedia.postId, created.id))).toEqual([
        expect.objectContaining({ storageKey: `posts/ticket-06-${suffix}.webp` }),
      ]);
      expect(
        await tx
          .select()
          .from(adminAuditLogs)
          .where(
            and(
              eq(adminAuditLogs.resourceId, created.id),
              eq(adminAuditLogs.action, "post.created"),
            ),
          ),
      ).toHaveLength(1);
    });
  }, 60_000);

  it("edits embedded creator identity and preserves locked mirrored attribution", async () => {
    const created = await createAdminPost(
      input({
        slug: `ticket-06-edit-${suffix}`,
        creator: {
          name: "Transactional creator",
          username: `ticket06_edit_${suffix}`,
          avatarUrl: "/brand/default-avatar.svg",
        },
      }),
      { userId: "ticket-06-admin" },
    );
    postIds.push(created.id);
    const [post] = await withWriteTransaction((tx) =>
      tx.select().from(posts).where(eq(posts.id, created.id)),
    );
    creatorIds.push(post.creatorId);

    const updated = await updateAdminPost(
      created.id,
      input({
        slug: `ticket-06-edited-${suffix}`,
        title: "Updated design",
        creator: {
          id: post.creatorId,
          name: "Updated creator",
          username: `ticket06_edited_${suffix}`,
          avatarUrl: "/ticket-06.webp",
          avatarStorageProvider: "r2",
          avatarStorageKey: `posts/ticket-06-${suffix}.webp`,
        },
        media: [
          {
            type: "image",
            url: "/replacement.webp",
            storageProvider: "r2",
            storageKey: `posts/ticket-06-replacement-${suffix}.webp`,
            alt: "Replacement",
            width: 1200,
            height: 900,
          },
        ],
      }),
      { userId: "ticket-06-admin" },
    );
    expect(updated).toMatchObject({
      id: created.id,
      previousSlug: `ticket-06-edit-${suffix}`,
      removedManagedMedia: [],
    });

    const mirroredId = randomUUID();
    creatorIds.push(mirroredId);
    await withWriteTransaction(async (tx) => {
      await tx.insert(creators).values({
        id: mirroredId,
        name: "Protected mirror",
        username: `ticket06_mirror_${suffix}`,
        avatarUrl: "/brand/default-avatar.svg",
        recordOrigin: "mirrored",
      });
      await tx.insert(creatorUsernameAliases).values({
        creatorId: mirroredId,
        username: `ticket06_mirror_${suffix}`,
        isCurrent: true,
      });
    });
    const attributed = await createAdminPost(
      input({
        slug: `ticket-06-mirror-${suffix}`,
        creator: {
          id: mirroredId,
          name: "Attempted mirror edit",
          username: `ticket06_changed_${suffix}`,
          avatarUrl: "/changed.svg",
        },
      }),
      { userId: "ticket-06-admin" },
    );
    postIds.push(attributed.id);

    await withWriteTransaction(async (tx) => {
      const [creator] = await tx.select().from(creators).where(eq(creators.id, mirroredId));
      expect(creator).toMatchObject({
        name: "Protected mirror",
        username: `ticket06_mirror_${suffix}`,
        avatarUrl: "/brand/default-avatar.svg",
      });
      const [savedPost] = await tx.select().from(posts).where(eq(posts.id, attributed.id));
      expect(savedPost.creatorId).toBe(mirroredId);
    });
  }, 60_000);

  it("rolls back creator, alias, design, media, and audit when create fails before commit", async () => {
    const rollbackInput = input({
      slug: `ticket-06-rollback-create-${suffix}`,
      creator: {
        name: "Rolled back creator",
        username: `t06_rc_${suffix}`,
        avatarUrl: "/brand/default-avatar.svg",
      },
      media: [
        {
          type: "image",
          url: "/rollback-create.webp",
          storageProvider: "r2",
          storageKey: `posts/t06-rollback-create-${suffix}.webp`,
          alt: "Rollback create",
          width: 1200,
          height: 900,
        },
      ],
    });
    const auditCountBefore = await withWriteTransaction(async (tx) =>
      (
        await tx
          .select({ id: adminAuditLogs.id })
          .from(adminAuditLogs)
          .where(
            and(
              eq(adminAuditLogs.actorId, "ticket-06-admin"),
              eq(adminAuditLogs.action, "post.created"),
            ),
          )
      ).length,
    );
    external.rollbackNext = true;
    await expect(
      createAdminPost(rollbackInput, { userId: "ticket-06-admin" }),
    ).rejects.toThrow("Forced failure");

    await withWriteTransaction(async (tx) => {
      expect(
        await tx.select().from(creators).where(eq(creators.username, `t06_rc_${suffix}`)),
      ).toHaveLength(0);
      expect(
        await tx.select().from(creatorUsernameAliases).where(eq(creatorUsernameAliases.username, `t06_rc_${suffix}`)),
      ).toHaveLength(0);
      expect(await tx.select().from(posts).where(eq(posts.slug, rollbackInput.slug))).toHaveLength(0);
      expect(
        await tx
          .select()
          .from(postMedia)
          .where(
            eq(postMedia.storageKey, `posts/t06-rollback-create-${suffix}.webp`),
          ),
      ).toHaveLength(0);
      expect(
        (
          await tx
            .select({ id: adminAuditLogs.id })
            .from(adminAuditLogs)
            .where(
              and(
                eq(adminAuditLogs.actorId, "ticket-06-admin"),
                eq(adminAuditLogs.action, "post.created"),
              ),
            )
        ).length,
      ).toBe(auditCountBefore);
    });
  }, 60_000);

  it("rolls back embedded edits, design fields, media, and audit on update failure", async () => {
    const created = await createAdminPost(
      input({
        slug: `ticket-06-rollback-update-${suffix}`,
        creator: {
          name: "Transactional creator",
          username: `t06_ru_${suffix}`,
          avatarUrl: "/brand/default-avatar.svg",
        },
      }),
      { userId: "ticket-06-admin" },
    );
    postIds.push(created.id);
    const [before] = await withWriteTransaction((tx) =>
      tx.select().from(posts).where(eq(posts.id, created.id)),
    );
    creatorIds.push(before.creatorId);

    external.rollbackNext = true;
    await expect(
      updateAdminPost(
        created.id,
        input({
          slug: `ticket-06-must-not-stick-${suffix}`,
          title: "Must not stick",
          creator: {
            id: before.creatorId,
            name: "Must not stick",
            username: `t06_no_${suffix}`,
            avatarUrl: "/changed.svg",
          },
          media: [{ type: "image", url: "/changed.webp", alt: "Changed", width: 1, height: 1 }],
        }),
        { userId: "ticket-06-admin" },
      ),
    ).rejects.toThrow("Forced failure");

    await withWriteTransaction(async (tx) => {
      const [post] = await tx.select().from(posts).where(eq(posts.id, created.id));
      const [creator] = await tx.select().from(creators).where(eq(creators.id, before.creatorId));
      expect(post).toMatchObject({ slug: `ticket-06-rollback-update-${suffix}`, title: "Transactional design" });
      expect(creator).toMatchObject({ name: "Transactional creator", username: `t06_ru_${suffix}` });
      expect(
        await tx
          .select()
          .from(creatorUsernameAliases)
          .where(eq(creatorUsernameAliases.creatorId, before.creatorId)),
      ).toEqual([
        expect.objectContaining({ username: `t06_ru_${suffix}`, isCurrent: true }),
      ]);
      expect(
        await tx
          .select()
          .from(creatorUsernameAliases)
          .where(eq(creatorUsernameAliases.username, `t06_no_${suffix}`)),
      ).toHaveLength(0);
      expect(await tx.select().from(postMedia).where(eq(postMedia.postId, created.id))).toEqual([
        expect.objectContaining({ storageKey: `posts/ticket-06-${suffix}.webp` }),
      ]);
      expect(
        await tx
          .select()
          .from(adminAuditLogs)
          .where(and(eq(adminAuditLogs.resourceId, created.id), eq(adminAuditLogs.action, "post.updated"))),
      ).toHaveLength(0);
    });
  }, 60_000);
});
