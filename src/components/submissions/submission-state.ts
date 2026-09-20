import type {
  SubmissionKind,
  SubmissionReceipt,
} from "@/features/submissions/types";

export type SubmissionStep =
  | { page: "type" }
  | { page: "method"; kind: "design" | "logo" }
  | { page: "link"; kind: SubmissionKind }
  | { page: "upload"; kind: "design" | "logo" };

const submissionTitles: Record<SubmissionKind, string> = {
  design: "Design",
  website: "Website",
  logo: "Logo",
  "app-icon": "App Icon",
};

export function submissionStepPresentation(step: SubmissionStep) {
  if (step.page === "type") {
    return {
      title: "Submit",
      description: "Choose what you want to submit.",
    };
  }
  if (step.page === "method") {
    return {
      title: submissionTitles[step.kind],
      description: "Choose the upload method.",
    };
  }
  if (step.page === "upload") {
    return {
      title: submissionTitles[step.kind],
      description: step.kind === "design"
        ? "Upload your design."
        : "Upload your logo.",
    };
  }
  return {
    title: submissionTitles[step.kind],
    description: step.kind === "website"
      ? "Use a live website URL."
      : step.kind === "app-icon"
        ? "Use an App Store listing."
        : "Use an X post URL.",
  };
}

export function firstStepForKind(kind: SubmissionKind): SubmissionStep {
  return kind === "design" || kind === "logo"
    ? { page: "method", kind }
    : { page: "link", kind };
}

export function previousSubmissionStep(step: SubmissionStep): SubmissionStep {
  if (step.page === "type") return step;
  if (step.page === "method") return { page: "type" };
  if (step.kind === "design" || step.kind === "logo") {
    return { page: "method", kind: step.kind };
  }
  return { page: "type" };
}

export function submissionAuthHref() {
  return `/sign-in?redirect_url=${encodeURIComponent("/profile?submit=1")}`;
}

export function hasSubmissionIntent(value: string) {
  const url = new URL(value, "https://inspora.local");
  return url.pathname === "/profile" && url.searchParams.get("submit") === "1";
}

export function removeSubmissionIntent(value: string) {
  const url = new URL(value, "https://inspora.local");
  url.searchParams.delete("submit");
  const search = url.searchParams.size > 0 ? `?${url.searchParams}` : "";
  return `${url.pathname}${search}${url.hash}`;
}

export function submissionReceiptDestination(receipt: SubmissionReceipt) {
  return receipt.ownerHref;
}

export function navigateToSubmission(
  router: { push: (href: string) => void },
  href: string,
) {
  router.push(href);
}
