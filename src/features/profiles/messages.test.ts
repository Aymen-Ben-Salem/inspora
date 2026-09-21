import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));

import {
  dismissProfileMessageWithStore,
  projectOwnProfileActivity,
} from "./messages-repository";

describe("owner profile activity", () => {
  it("keeps other owners and expired rejections out of the private projection", () => {
    const now = new Date("2026-09-21T12:00:00.000Z");
    const activity = projectOwnProfileActivity({
      ownerUserId: "user_owner",
      now,
      submissions: [
        {
          id: "sub-review",
          ownerUserId: "user_owner",
          kind: "design",
          status: "in_review",
          sourceUrl: null,
          uploadId: "upload-1",
          createdAt: new Date("2026-09-21T10:00:00.000Z"),
          reviewedAt: null,
          expiresAt: null,
          rejectionReason: null,
          mediaType: "image/png",
        },
        {
          id: "sub-other",
          ownerUserId: "user_other",
          kind: "website",
          status: "in_review",
          sourceUrl: "https://private.example/secret",
          uploadId: null,
          createdAt: new Date("2026-09-21T10:00:00.000Z"),
          reviewedAt: null,
          expiresAt: null,
          rejectionReason: null,
          mediaType: null,
        },
        {
          id: "sub-expired",
          ownerUserId: "user_owner",
          kind: "logo",
          status: "rejected",
          sourceUrl: "https://x.com/example/status/1",
          uploadId: null,
          createdAt: new Date("2026-09-18T10:00:00.000Z"),
          reviewedAt: new Date("2026-09-19T10:00:00.000Z"),
          expiresAt: new Date("2026-09-21T10:00:00.000Z"),
          rejectionReason: "Not a fit",
          mediaType: null,
        },
      ],
      messages: [
        {
          id: "msg-owner",
          ownerUserId: "user_owner",
          kind: "submission_accepted",
          publishedHref: "/posts/published",
          createdAt: new Date("2026-09-21T09:00:00.000Z"),
          dismissedAt: null,
        },
        {
          id: "msg-other",
          ownerUserId: "user_other",
          kind: "submission_accepted",
          publishedHref: "/posts/private",
          createdAt: new Date("2026-09-21T09:00:00.000Z"),
          dismissedAt: null,
        },
      ],
    });

    expect(activity.submissions.map((item) => item.id)).toEqual(["sub-review"]);
    expect(activity.submissions[0]).toMatchObject({
      source: "upload",
      sourceDomain: null,
      mediaType: "image/png",
    });
    expect(activity.messages).toEqual([
      {
        id: "msg-owner",
        kind: "submission_accepted",
        publishedHref: "/posts/published",
        createdAt: "2026-09-21T09:00:00.000Z",
      },
    ]);
  });

  it("uses the stored fixed rejection deadline and exposes only the domain", () => {
    const activity = projectOwnProfileActivity({
      ownerUserId: "user_owner",
      now: new Date("2026-09-20T12:00:00.000Z"),
      submissions: [{
        id: "sub-rejected",
        ownerUserId: "user_owner",
        kind: "website",
        status: "rejected",
        sourceUrl: "https://example.com/private/path?token=secret",
        uploadId: null,
        createdAt: new Date("2026-09-19T10:00:00.000Z"),
        reviewedAt: new Date("2026-09-20T10:00:00.000Z"),
        expiresAt: new Date("2026-09-22T11:00:00.000Z"),
        rejectionReason: "Not enough detail",
        mediaType: null,
      }],
      messages: [],
    });

    expect(activity.submissions[0]).toMatchObject({
      source: "link",
      sourceDomain: "example.com",
      sourceUrl: "https://example.com/private/path?token=secret",
      rejectionExpiresAt: "2026-09-22T11:00:00.000Z",
    });
  });

  it("dismisses only a message owned by the authenticated account", async () => {
    const rows = new Map([["msg-owner", "user_owner"]]);
    const store = {
      dismissOwnedMessage: vi.fn(async (ownerUserId: string, messageId: string) => {
        if (rows.get(messageId) !== ownerUserId) return false;
        rows.delete(messageId);
        return true;
      }),
    };

    await expect(dismissProfileMessageWithStore(store, "user_other", "msg-owner"))
      .resolves.toEqual({ ok: false, code: "forbidden", message: "That message is unavailable." });
    await expect(dismissProfileMessageWithStore(store, "user_owner", "msg-owner"))
      .resolves.toEqual({ ok: true, value: null });
  });
});
