"use client";

import { useEffect, useRef } from "react";

export function SponsorVerification() {
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // The callback sets cookies and redirects. Use a document navigation so an
    // authentication refresh cannot leave its redirect in a pending RSC render.
    window.location.replace("/api/sponsorship/verify");
  }, []);

  return (
    <>
      <p role="status">Verifying sponsor access…</p>
      <a
        href="/api/sponsorship/verify"
        className="focus-ring mt-4 inline-block text-sm text-[#767676] underline underline-offset-4"
      >
        Continue verification
      </a>
    </>
  );
}
