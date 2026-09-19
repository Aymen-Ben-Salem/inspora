import { z } from "zod";

import type {
  CreateSubmissionInput,
  SubmissionResult,
  ValidatedCreateSubmissionInput,
} from "./types";

const requestIdSchema = z.uuid();
const uploadIdSchema = z.uuid();
const xHandlePattern = /^[a-z0-9_]{1,15}$/i;
const xStatusIdPattern = /^\d+$/;

function invalid(message: string): SubmissionResult<never> {
  return { ok: false, code: "invalid_input", message };
}

function parseAbsoluteWebUrl(value: string) {
  if (value.length > 2048) return null;

  try {
    const url = new URL(value);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:") ||
      url.username ||
      url.password
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function canonicalXStatusUrl(value: string) {
  const url = parseAbsoluteWebUrl(value);
  if (!url || url.protocol !== "https:" || url.port) return null;
  const hostname = url.hostname.toLowerCase();
  if (
    hostname !== "x.com" &&
    hostname !== "www.x.com" &&
    hostname !== "twitter.com" &&
    hostname !== "www.twitter.com"
  ) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (
    segments.length !== 3 ||
    !xHandlePattern.test(segments[0] ?? "") ||
    segments[1]?.toLowerCase() !== "status" ||
    !xStatusIdPattern.test(segments[2] ?? "")
  ) {
    return null;
  }
  return `https://x.com/${segments[0]!.toLowerCase()}/status/${segments[2]}`;
}

function canonicalWebsiteUrl(value: string) {
  const url = parseAbsoluteWebUrl(value);
  if (!url) return null;
  url.hash = "";
  return url.toString();
}

function canonicalAppStoreUrl(value: string) {
  const url = parseAbsoluteWebUrl(value);
  if (
    !url ||
    url.protocol !== "https:" ||
    url.port ||
    url.hostname.toLowerCase() !== "apps.apple.com"
  ) {
    return null;
  }
  const segments = url.pathname.split("/").filter(Boolean);
  const appIndex = segments.findIndex((segment) => segment.toLowerCase() === "app");
  if (
    appIndex < 0 ||
    appIndex > 1 ||
    segments.length < appIndex + 3 ||
    !/^id\d+$/.test(segments.at(-1) ?? "")
  ) {
    return null;
  }
  url.hash = "";
  return url.toString();
}

export function validateCreateSubmissionInput(
  input: unknown,
): SubmissionResult<ValidatedCreateSubmissionInput> {
  if (!input || typeof input !== "object") {
    return invalid("Submission details are invalid.");
  }
  const candidate = input as Partial<CreateSubmissionInput>;
  if (!requestIdSchema.safeParse(candidate.requestId).success) {
    return invalid("The submission request ID is invalid.");
  }

  if (candidate.source === "upload") {
    if (
      (candidate.kind !== "design" && candidate.kind !== "logo") ||
      !uploadIdSchema.safeParse(candidate.uploadId).success
    ) {
      return invalid("This submission type does not support that upload.");
    }
    return {
      ok: true,
      value: {
        requestId: candidate.requestId!,
        kind: candidate.kind,
        source: "upload",
        uploadId: candidate.uploadId!,
      },
    };
  }

  if (candidate.source !== "link" || typeof candidate.url !== "string") {
    return invalid("Choose one valid submission source.");
  }
  const originalUrl = candidate.url.trim();
  let canonicalUrl: string | null = null;
  if (candidate.kind === "design" || candidate.kind === "logo") {
    canonicalUrl = canonicalXStatusUrl(originalUrl);
  } else if (candidate.kind === "website") {
    canonicalUrl = canonicalWebsiteUrl(originalUrl);
  } else if (candidate.kind === "app-icon") {
    canonicalUrl = canonicalAppStoreUrl(originalUrl);
  }
  if (!canonicalUrl) {
    return invalid("Enter a valid link for this submission type.");
  }

  return {
    ok: true,
    value: {
      requestId: candidate.requestId!,
      kind: candidate.kind!,
      source: "link",
      originalUrl,
      canonicalUrl,
      fingerprint: `url:${canonicalUrl}`,
    },
  };
}
