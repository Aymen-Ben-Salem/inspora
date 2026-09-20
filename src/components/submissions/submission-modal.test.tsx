import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("../../features/submissions/actions", () => ({
  createOwnSubmission: vi.fn(),
}));
vi.mock("../../features/submissions/upload-actions", () => ({
  beginOwnUpload: vi.fn(),
  completeOwnUpload: vi.fn(),
  discardOwnUpload: vi.fn(),
}));
vi.mock("../../features/profiles/messages", () => ({
  dismissOwnProfileMessage: vi.fn(),
}));

import { ProfileMessages } from "../profile/profile-messages";
import { SubmissionCard } from "./submission-card";
import { SubmissionDetail } from "./submission-detail";
import { SubmissionModal } from "./submission-modal";
import { submissionUploadPolicy } from "./submission-upload";
import {
  uploadSubmissionFile,
  type UploadRequest,
} from "./submission-upload";

describe("shared submission modal", () => {
  it("starts with the exact Figma type picker copy and no row descriptions", () => {
    const html = renderToStaticMarkup(
      <SubmissionModal open onDismiss={vi.fn()} onSubmitted={vi.fn()} />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain(">Submit</h2>");
    expect(html).toContain("Choose what you want to submit.");
    expect(html).toContain("Design");
    expect(html).toContain("Website");
    expect(html).toContain("Logo");
    expect(html).toContain("App Icon");
    expect(html).not.toContain("An X post link or one image, video or GIF.");
    expect(html).not.toContain("A live website URL.");
    expect(html).not.toContain('aria-label="Close"');
  });

  it("uses the approved upload copy and limits", () => {
    expect(submissionUploadPolicy("design")).toEqual({
      accept: "image/jpeg,image/png,image/webp,image/avif,image/gif,video/mp4,video/webm",
      heading: "Upload your design",
      support: "Supports JPG, PNG, WebP, AVIF, GIF, MP4 or WebM",
      limit: "Images and GIFs up to 10 MB; videos up to 50 MB",
    });
    expect(submissionUploadPolicy("logo")).toEqual({
      accept: "image/jpeg,image/png,image/webp,image/avif",
      heading: "Upload your logo",
      support: "Supports JPG, PNG, WebP or AVIF",
      limit: "Maximum file size: 10 MB",
    });
  });

  it("uploads the selected file with signed headers and reports progress", async () => {
    const listeners = new Map<string, () => void>();
    const uploadListeners = new Map<string, (event: { lengthComputable: boolean; loaded: number; total: number }) => void>();
    const request = {
      status: 204,
      upload: { addEventListener: vi.fn((name, listener) => uploadListeners.set(name, listener)) },
      addEventListener: vi.fn((name, listener) => listeners.set(name, listener)),
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn(() => {
        uploadListeners.get("progress")?.({ lengthComputable: true, loaded: 5, total: 20 });
        listeners.get("load")?.();
      }),
    } satisfies UploadRequest;
    const progress = vi.fn();

    await uploadSubmissionFile({
      file: new Blob(["private-file"], { type: "image/png" }),
      ticket: {
        uploadId: "upload-1",
        uploadUrl: "https://private.invalid/upload",
        method: "PUT",
        headers: { "Content-Type": "image/png", "X-Signed": "yes" },
        expiresAt: "2026-09-20T00:00:00.000Z",
      },
      onProgress: progress,
      createRequest: () => request,
    });

    expect(request.open).toHaveBeenCalledWith("PUT", "https://private.invalid/upload");
    expect(request.setRequestHeader).toHaveBeenCalledWith("X-Signed", "yes");
    expect(request.send).toHaveBeenCalledOnce();
    expect(progress).toHaveBeenCalledWith(25);
  });

  it("reports a failed private upload instead of fabricating submission success", async () => {
    const listeners = new Map<string, () => void>();
    const request = {
      status: 503,
      upload: { addEventListener: vi.fn() },
      addEventListener: vi.fn((name, listener) => listeners.set(name, listener)),
      open: vi.fn(),
      setRequestHeader: vi.fn(),
      send: vi.fn(() => listeners.get("load")?.()),
    } satisfies UploadRequest;

    await expect(uploadSubmissionFile({
      file: new Blob(["private-file"], { type: "image/png" }),
      ticket: {
        uploadId: "upload-1",
        uploadUrl: "https://private.invalid/upload",
        method: "PUT",
        headers: {},
        expiresAt: "2026-09-20T00:00:00.000Z",
      },
      createRequest: () => request,
    })).rejects.toThrow("Upload failed with status 503");
  });

  it("keeps private URL and upload review cards distinct", () => {
    const urlCard = renderToStaticMarkup(
      <SubmissionCard
        submission={{
          id: "sub-url",
          kind: "website",
          status: "in_review",
          source: "link",
          sourceDomain: "example.com",
          sourceUrl: "https://example.com/private",
          createdAt: "2026-09-19T10:00:00.000Z",
          rejectionReason: null,
          rejectionExpiresAt: null,
          mediaType: null,
        }}
        onSelect={vi.fn()}
      />,
    );
    const uploadCard = renderToStaticMarkup(
      <SubmissionCard
        submission={{
          id: "sub-upload",
          kind: "design",
          status: "in_review",
          source: "upload",
          sourceDomain: null,
          sourceUrl: null,
          createdAt: "2026-09-19T10:00:00.000Z",
          rejectionReason: null,
          rejectionExpiresAt: null,
          mediaType: "image/png",
        }}
        onSelect={vi.fn()}
      />,
    );

    expect(urlCard).toContain("Website");
    expect(urlCard).toContain("example.com");
    expect(urlCard).not.toContain("/api/submissions/sub-url/media");
    expect(uploadCard).toContain("/api/submissions/sub-upload/media");
    expect(uploadCard).toContain("blur");
    expect(uploadCard).toContain("In Review");
  });

  it("renders durable acceptance and distinct claim messages", () => {
    const html = renderToStaticMarkup(
      <ProfileMessages
        messages={[
          {
            id: "msg-accepted",
            kind: "submission_accepted",
            createdAt: "2026-09-19T10:00:00.000Z",
            publishedHref: "/posts/published",
          },
          {
            id: "msg-claim",
            kind: "claim_approved",
            createdAt: "2026-09-19T11:00:00.000Z",
            publishedHref: null,
          },
        ]}
      />,
    );

    expect(html).toContain("Submission accepted");
    expect(html).toContain("Creator claim approved");
    expect(html).toContain('href="/posts/published"');
    expect(html.match(/Dismiss/g)).toHaveLength(2);
  });

  it("shows the owner a read-only source while deferring withdrawal to Task 6", () => {
    const html = renderToStaticMarkup(
      <SubmissionDetail
        open
        onDismiss={vi.fn()}
        submission={{
          id: "sub-link",
          kind: "website",
          status: "rejected",
          source: "link",
          sourceDomain: "example.com",
          sourceUrl: "https://example.com/private/path",
          createdAt: "2026-09-19T10:00:00.000Z",
          rejectionReason: "The submitted page is incomplete.",
          rejectionExpiresAt: "2026-09-21T10:00:00.000Z",
          mediaType: null,
        }}
      />,
    );

    expect(html).toContain('href="https://example.com/private/path"');
    expect(html).toContain("The submitted page is incomplete.");
    expect(html).toContain("Not accepted");
    expect(html).not.toContain("Withdraw");
  });
});
