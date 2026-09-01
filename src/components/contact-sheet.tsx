"use client";

import { BottomSheet } from "./bottom-sheet";

const CONTACT_EMAIL = "neroodesigner@gmail.com";
const X_PROFILE_URL = "https://x.com/neropursue?s=11";

export function ContactSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={"Let\u2019s talk."}
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
        <label
          htmlFor="contact-email"
          className="flex h-12 cursor-text items-center gap-2 bg-[#262626] px-4 text-white transition-colors hover:bg-black focus-within:outline-2 focus-within:outline-offset-3 focus-within:outline-[#111]"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="size-[17px] shrink-0" fill="none">
            <path d="M3.5 6.5h17v11h-17v-11Z" stroke="currentColor" strokeWidth="1.4" />
            <path d="m4 7 8 6 8-6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          <input
            id="contact-email"
            type="text"
            readOnly
            value={CONTACT_EMAIL}
            aria-label="Email address. Select it, then copy with your browser or keyboard."
            title="Select and copy email"
            onFocus={(event) => event.currentTarget.select()}
            onClick={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 cursor-text bg-transparent text-center text-[14px] text-white outline-none selection:bg-white selection:text-[#262626]"
          />
        </label>
      </div>
    </BottomSheet>
  );
}
