"use client";

import { useState } from "react";

import { BottomSheet } from "./bottom-sheet";

const CONTACT_EMAIL = "neroodesigner@gmail.com";
const X_PROFILE_URL = "https://x.com/neropursue?s=11";

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export function ContactSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await copyText(CONTACT_EMAIL);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Let’s talk."
      description="For collaborations, questions, or anything Inspora-related, reach us on X or by email."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <a
          href={X_PROFILE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-ring flex h-12 items-center justify-center gap-2 border border-black/15 text-[14px] text-[#262626] transition-colors hover:bg-[#f5f5f5]"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="currentColor">
            <path d="M18.9 2H22l-6.77 7.74L23.2 22h-6.24l-4.89-6.39L6.48 22H3.36l7.26-8.3L2.97 2H9.37l4.42 5.84L18.9 2Zm-1.1 17.84h1.72L8.43 4.05H6.58L17.8 19.84Z" />
          </svg>
          Continue on X
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className="focus-ring flex h-12 items-center justify-center gap-2 bg-[#262626] text-[14px] text-white transition-colors hover:bg-black"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[17px]" fill="none">
            <path d="M3.5 6.5h17v11h-17v-11Z" stroke="currentColor" strokeWidth="1.4" />
            <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          {copied ? "Email copied" : "Copy email"}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {copied ? CONTACT_EMAIL + " copied to clipboard." : ""}
      </p>
    </BottomSheet>
  );
}
