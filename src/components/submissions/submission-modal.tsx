"use client";

import Image from "next/image";
import { useRef, useState, type FormEvent } from "react";

import { ProfileModal } from "../profile/profile-modal";
import { createOwnSubmission } from "../../features/submissions/actions";
import {
  beginOwnUpload,
  completeOwnUpload,
  discardOwnUpload,
} from "../../features/submissions/upload-actions";
import type {
  SubmissionKind,
  SubmissionResult,
} from "../../features/submissions/types";

import {
  firstStepForKind,
  previousSubmissionStep,
  submissionReceiptDestination,
  submissionStepPresentation,
  type SubmissionStep,
} from "./submission-state";
import {
  SubmissionUpload,
  submissionUploadPolicy,
  uploadSubmissionFile,
} from "./submission-upload";

const kinds: Array<{ kind: SubmissionKind; label: string }> = [
  { kind: "design", label: "Design" },
  { kind: "website", label: "Website" },
  { kind: "logo", label: "Logo" },
  { kind: "app-icon", label: "App Icon" },
];

const fieldCopy = {
  design: { label: "X post URL", placeholder: "https://x.com/..." },
  logo: { label: "X post URL", placeholder: "https://x.com/..." },
  website: { label: "Live website URL", placeholder: "https://example.com" },
  "app-icon": {
    label: "Apple App Store listing URL",
    placeholder: "/apps.apple.com/app/...",
  },
} as const;

function failureMessage(result: SubmissionResult<unknown>) {
  if (result.ok) return undefined;
  if (result.code === "daily_limit" && result.retryAt) {
    return `${result.message} Try again after ${new Date(result.retryAt).toLocaleString()}.`;
  }
  return result.message;
}

function newRequestId() {
  return crypto.randomUUID();
}

export function SubmissionModal({
  onDismiss,
  onSubmitted,
  open,
}: {
  onDismiss: () => void;
  onSubmitted: (href: string) => void;
  open: boolean;
}) {
  const [step, setStep] = useState<SubmissionStep>({ page: "type" });
  const [links, setLinks] = useState<Partial<Record<SubmissionKind, string>>>({});
  const [files, setFiles] = useState<Partial<Record<"design" | "logo", File>>>({});
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<number>();
  const [error, setError] = useState<string>();
  const requestIds = useRef(new Map<string, string>());
  const reservedUploads = useRef(new Map<string, string>());
  const dirty = Object.values(links).some((value) => value?.trim())
    || Object.keys(files).length > 0;

  function requestIdFor(key: string) {
    const existing = requestIds.current.get(key);
    if (existing) return existing;
    const created = newRequestId();
    requestIds.current.set(key, created);
    return created;
  }

  function reset() {
    setStep({ page: "type" });
    setLinks({});
    setFiles({});
    setBusy(false);
    setProgress(undefined);
    setError(undefined);
    requestIds.current.clear();
    reservedUploads.current.clear();
  }

  function close() {
    for (const uploadId of reservedUploads.current.values()) {
      void discardOwnUpload(uploadId);
    }
    reset();
    onDismiss();
  }

  function finish(href: string) {
    reset();
    onSubmitted(href);
  }

  async function submitLink(event: FormEvent<HTMLFormElement>, kind: SubmissionKind) {
    event.preventDefault();
    if (busy) return;
    const url = links[kind]?.trim() ?? "";
    setBusy(true);
    setError(undefined);
    try {
      const result = await createOwnSubmission({
        requestId: requestIdFor(`${kind}:link:${url}`),
        kind,
        source: "link",
        url,
      });
      if (!result.ok) {
        setError(failureMessage(result));
        return;
      }
      finish(submissionReceiptDestination(result.value));
    } catch {
      setError("The submission response was interrupted. Retry to continue with the same request.");
    } finally {
      setBusy(false);
    }
  }

  async function submitUpload(event: FormEvent<HTMLFormElement>, kind: "design" | "logo") {
    event.preventDefault();
    if (busy) return;
    const file = files[kind];
    if (!file) {
      setError("Choose one file to upload.");
      return;
    }
    const policy = submissionUploadPolicy(kind);
    const accepted = policy.accept.split(",").includes(file.type);
    const maxBytes = file.type.startsWith("video/") ? 50 * 1024 * 1024 : 10 * 1024 * 1024;
    if (!accepted || file.size > maxBytes) {
      setError(`${policy.support}. ${policy.limit}.`);
      return;
    }

    const requestId = requestIdFor(`${kind}:upload`);
    setBusy(true);
    setProgress(0);
    setError(undefined);
    try {
      const ticket = await beginOwnUpload({
        requestId,
        kind,
        contentType: file.type,
        sizeBytes: file.size,
      });
      if (!ticket.ok) {
        setError(failureMessage(ticket));
        return;
      }
      reservedUploads.current.set(`${kind}:upload`, ticket.value.uploadId);
      await uploadSubmissionFile({
        file,
        ticket: ticket.value,
        onProgress: setProgress,
      });
      const completed = await completeOwnUpload(ticket.value.uploadId);
      if (!completed.ok) {
        setError(failureMessage(completed));
        return;
      }
      const created = await createOwnSubmission({
        requestId,
        kind,
        source: "upload",
        uploadId: ticket.value.uploadId,
      });
      if (!created.ok) {
        setError(failureMessage(created));
        return;
      }
      reservedUploads.current.delete(`${kind}:upload`);
      finish(submissionReceiptDestination(created.value));
    } catch {
      setError("The upload did not complete. Retry to continue with the same request.");
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  }

  const presentation = submissionStepPresentation(step);

  return (
    <ProfileModal
      open={open}
      label={presentation.title}
      description={presentation.description}
      dirty={Boolean(dirty)}
      discardMessage="Discard this submission and its selected file?"
      onDismiss={close}
    >
      {step.page === "type" ? (
        <div className="flex flex-col divide-y divide-[#f0f0f0]">
          {kinds.map((item) => (
            <button
              key={item.kind}
              type="button"
              disabled={busy}
              onClick={() => {
                setError(undefined);
                setStep(firstStepForKind(item.kind));
              }}
              className="focus-ring flex h-[53.75px] w-full items-center justify-between gap-5 px-4 text-left disabled:opacity-50"
            >
              <span className="text-sm font-medium tracking-[-0.28px] text-[#262626]">
                {item.label}
              </span>
              <SubmissionChevron />
            </button>
          ))}
        </div>
      ) : step.page === "method" ? (
        <div className="flex flex-col divide-y divide-[#f0f0f0]">
          <button
            type="button"
            onClick={() => setStep({ page: "link", kind: step.kind })}
            className="focus-ring flex min-h-[49.5px] w-full items-center justify-between py-[3px] text-left"
          >
            <span>
              <span className="block text-sm font-medium leading-[normal] tracking-[-0.28px]">
                Link
              </span>
              <span className="mt-1 block text-xs leading-[normal] tracking-[-0.24px] text-[#767676]">
                Use an X post URL.
              </span>
            </span>
            <SubmissionChevron />
          </button>
          <button
            type="button"
            onClick={() => setStep({ page: "upload", kind: step.kind })}
            className="focus-ring flex min-h-[49.5px] w-full items-center justify-between py-[3px] text-left"
          >
            <span>
              <span className="block text-sm font-medium leading-[normal] tracking-[-0.28px]">
                Upload
              </span>
              <span className="mt-1 block text-xs leading-[normal] tracking-[-0.24px] text-[#767676]">
                {step.kind === "design"
                  ? "Upload an image, video or GIF."
                  : "Upload an image."}
              </span>
            </span>
            <SubmissionChevron />
          </button>
        </div>
      ) : step.page === "link" ? (
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => void submitLink(event, step.kind)}
        >
          <input
            aria-label={fieldCopy[step.kind].label}
            type="url"
            required
            disabled={busy}
            value={links[step.kind] ?? ""}
            placeholder={fieldCopy[step.kind].placeholder}
            onChange={(event) => {
              setLinks((current) => ({
                ...current,
                [step.kind]: event.target.value,
              }));
            }}
            className="focus-ring h-11 w-full rounded-[3px] border border-[#e6e6e6] bg-white px-4 text-sm font-medium tracking-[-0.28px] text-[#262626] placeholder:font-normal placeholder:text-[#767676] disabled:opacity-60"
          />
          <SubmissionError message={error} />
          <FormActions busy={busy} onBack={() => setStep(previousSubmissionStep(step))} />
        </form>
      ) : (
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => void submitUpload(event, step.kind)}
        >
          <SubmissionUpload
            kind={step.kind}
            file={files[step.kind] ?? null}
            disabled={busy}
            onFile={(file) => {
              if (files[step.kind] !== file) {
                const key = `${step.kind}:upload`;
                const uploadId = reservedUploads.current.get(key);
                if (uploadId) void discardOwnUpload(uploadId).catch(() => undefined);
                reservedUploads.current.delete(key);
                requestIds.current.delete(key);
              }
              setError(undefined);
              setFiles((current) => {
                const next = { ...current };
                if (file) next[step.kind] = file;
                else delete next[step.kind];
                return next;
              });
            }}
          />
          {busy && progress !== undefined ? (
            <div aria-live="polite">
              <div className="h-1.5 overflow-hidden rounded-full bg-[#ededed]">
                <div
                  className="h-full bg-[#262626] transition-[width]"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-[#767676]">Uploading {progress}%</p>
            </div>
          ) : null}
          <SubmissionError message={error} />
          <FormActions busy={busy} onBack={() => setStep(previousSubmissionStep(step))} />
        </form>
      )}
    </ProfileModal>
  );
}

function SubmissionError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="text-sm text-[#b42318]">
      {message}
    </p>
  ) : null;
}

function BackButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="focus-ring min-h-[41px] rounded-lg border border-[#e6e6e6] bg-white px-[18px] text-sm tracking-[-0.28px] text-[#262626] shadow-[0_1px_1px_#e6e6e6] disabled:opacity-50"
    >
      Back
    </button>
  );
}

function FormActions({ busy, onBack }: { busy: boolean; onBack: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <BackButton disabled={busy} onClick={onBack} />
      <button
        type="submit"
        disabled={busy}
        className="focus-ring min-h-[41px] rounded-lg bg-[#262626] px-4 text-sm tracking-[-0.28px] text-white shadow-[0_2px_0_#000] disabled:cursor-wait disabled:opacity-50"
      >
        {busy ? "Submitting..." : "Submit"}
      </button>
    </div>
  );
}

function SubmissionChevron() {
  return (
    <Image
      src="/icons/profile/chevron.svg"
      alt=""
      width={12}
      height={7}
      aria-hidden="true"
      className="-rotate-90"
    />
  );
}
