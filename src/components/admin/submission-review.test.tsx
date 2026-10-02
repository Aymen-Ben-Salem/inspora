import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

vi.mock("./post-editor", () => ({ PostEditor: vi.fn(() => null) }));
vi.mock("./logo-editor", () => ({ LogoEditor: vi.fn(() => null) }));
vi.mock("./website-editor", () => ({ WebsiteEditor: vi.fn(() => null) }));
vi.mock("../../features/media/prepare-and-upload", () => ({ prepareAndUploadMedia: vi.fn() }));

import { SubmissionReview } from "./submission-review";
import { PostEditor } from "./post-editor";
import { LogoEditor } from "./logo-editor";
import { prepareAndUploadMedia } from "../../features/media/prepare-and-upload";

const submission = {
  id: "submission-1", ownerUserId: "user-1", creatorId: "creator-1", creatorName: "Creator", creatorUsername: "creator",
  kind: "design", status: "in_review", sourceUrl: null, uploadId: "upload-1", mediaType: "image/png",
  mediaHref: "/api/submissions/submission-1/media", createdAt: "2026-09-29T00:00:00Z", reviewedAt: null,
  rejectionReason: null, expiresAt: null, publishedRef: null,
} satisfies ComponentProps<typeof SubmissionReview>["submission"];
const creator = { id: "creator-1", name: "Creator" } as ComponentProps<typeof SubmissionReview>["creator"];

describe("submission review media wiring", () => {
  beforeEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

  it.each(["design", "logo"] as const)("opens %s with its submitted file already in the editor", (kind) => {
    renderToStaticMarkup(<SubmissionReview submission={{ ...submission, kind }} creator={creator} creators={[creator]} categories={[]} acceptAction={vi.fn()} rejectAction={vi.fn()} />);
    const props = kind === "design" ? vi.mocked(PostEditor).mock.calls[0][0] : vi.mocked(LogoEditor).mock.calls[0][0];
    expect(props.submittedMediaHref).toBe(submission.mediaHref);
    expect(JSON.stringify(props)).toContain(submission.mediaHref);
    expect(prepareAndUploadMedia).not.toHaveBeenCalled();
  });

  it("prepares media on acceptance and forwards managed assets, allowing the server redirect", async () => {
    const redirect = new Error("NEXT_REDIRECT");
    const accept = vi.fn().mockRejectedValue(redirect);
    renderToStaticMarkup(<SubmissionReview submission={submission} creator={creator} creators={[creator]} categories={[]} acceptAction={accept} rejectAction={vi.fn()} />);
    const props = vi.mocked(PostEditor).mock.calls[0][0];
    const data = new FormData(); data.set("media", JSON.stringify(props.post!.media));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Blob(["png"], { type: "image/png" }))));
    vi.mocked(prepareAndUploadMedia).mockResolvedValue({ type: "image", url: "https://media.example/image.webp", alt: "Image", width: 640, height: 480, storageProvider: "r2", storageKey: "posts/image.webp" });
    await expect(props.action({ status: "idle" }, data)).rejects.toBe(redirect);
    expect(accept).toHaveBeenCalledOnce();
    expect(JSON.parse(String(data.get("media")))[0]).toMatchObject({ storageProvider: "r2", width: 640 });
  });

  it("shows preparation errors without attempting acceptance", async () => {
    const accept = vi.fn();
    renderToStaticMarkup(<SubmissionReview submission={submission} creator={creator} creators={[creator]} categories={[]} acceptAction={accept} rejectAction={vi.fn()} />);
    const props = vi.mocked(PostEditor).mock.calls[0][0];
    const data = new FormData(); data.set("media", JSON.stringify(props.post!.media));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    expect(await props.action({ status: "idle" }, data)).toMatchObject({ status: "error" });
    expect(accept).not.toHaveBeenCalled();
  });
});
