import { describe, expect, it, vi } from "vitest";
import { submissionMediaDraft, prepareSubmissionMedia } from "./submission-media";

const source = { id: "submission-1", kind: "design" as const, mediaHref: "/api/submissions/submission-1/media", mediaType: "image/png" };
const published = { type: "image" as const, url: "https://media.example/posts/new.webp", storageProvider: "r2" as const, storageKey: "posts/new.webp", width: 640, height: 480, alt: "Generated", variants: [] };
const form = (media: unknown) => { const data = new FormData(); data.set("media", JSON.stringify(media)); return data; };

describe("submitted media in the publication editor", () => {
  it("prefills uploaded images and videos without making a public copy", () => {
    expect(submissionMediaDraft(source)).toMatchObject({ url: source.mediaHref, type: "image" });
    expect(submissionMediaDraft({ ...source, mediaType: "video/mp4" })).toMatchObject({ type: "video" });
    expect(submissionMediaDraft({ ...source, mediaHref: null })).toBeUndefined();
  });

  it.each(["design", "logo"] as const)("prepares the attached %s automatically, retaining edited alt text", async (kind) => {
    const draft = { ...submissionMediaDraft({ ...source, kind }), alt: "My description" };
    const data = form(kind === "design" ? [draft] : draft);
    const fetchSource = vi.fn().mockResolvedValue(new Response(new Blob(["image"], { type: "image/png" })));
    const upload = vi.fn().mockResolvedValue(published);
    await prepareSubmissionMedia({ ...source, kind }, data, upload, fetchSource);
    expect(fetchSource).toHaveBeenCalledWith(source.mediaHref, { credentials: "same-origin", cache: "no-store", redirect: "error" });
    expect(upload.mock.calls[0][0]).toBeInstanceOf(File);
    expect(upload.mock.calls[0][1]).toBe(kind === "design" ? "post-media" : "logo-media");
    const result = JSON.parse(String(data.get("media")));
    expect(kind === "design" ? result[0] : result).toEqual({ ...published, alt: "My description" });
  });

  it("preserves manually replaced media and link-only submissions", async () => {
    const upload = vi.fn(); const fetchSource = vi.fn();
    const data = form([published]);
    await prepareSubmissionMedia(source, data, upload, fetchSource);
    await prepareSubmissionMedia({ ...source, mediaHref: null }, data, upload, fetchSource);
    expect(upload).not.toHaveBeenCalled(); expect(fetchSource).not.toHaveBeenCalled();
    expect(JSON.parse(String(data.get("media")))).toEqual([published]);
  });

  it("prepares only the submitted item in a larger gallery", async () => {
    const data = form([published, submissionMediaDraft(source)]);
    await prepareSubmissionMedia(source, data, vi.fn().mockResolvedValue(published), vi.fn().mockResolvedValue(new Response(new Blob(["image"], { type: "image/png" }))));
    expect(JSON.parse(String(data.get("media")))[0]).toEqual(published);
  });

  it("does not publish an unavailable private file or follow arbitrary source URLs", async () => {
    const upload = vi.fn(); const data = form([submissionMediaDraft(source)]);
    await expect(prepareSubmissionMedia(source, data, upload, vi.fn().mockResolvedValue(new Response(null, { status: 404 })))).rejects.toThrow("submitted file");
    await expect(prepareSubmissionMedia({ ...source, mediaHref: "https://other.example/file" }, data, upload, vi.fn())).rejects.toThrow("source");
    expect(upload).not.toHaveBeenCalled();
  });
});
