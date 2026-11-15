"use client";
import { useAuth } from "@clerk/nextjs";
import { useRef, useState, type FormEvent } from "react";

import { McpConsentCard, type McpClientDetails } from "./mcp-consent-card";

export type McpConsentProps = {
  ticket: string; csrf: string;
  details: McpClientDetails;
};

export function McpConsentForm({ ticket, csrf, details }: McpConsentProps) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const submitting = useRef(false), [pending, setPending] = useState(false), [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (submitting.current) return;
    const form = event.currentTarget, button = (event.nativeEvent as SubmitEvent).submitter;
    const decision = button instanceof HTMLButtonElement ? button.value : "";
    if (!["approve", "deny"].includes(decision)) return;
    submitting.current = true; setPending(true); setError("");
    try {
      if (!await getToken({ skipCache: true })) throw Error("Signed out");
      (form.elements.namedItem("decision") as HTMLInputElement).value = decision;
      // Native navigation preserves the OAuth provider's own browser cookie.
      HTMLFormElement.prototype.submit.call(form);
    } catch {
      submitting.current = false; setPending(false); setError("Your sign-in could not be refreshed. Reload this page and try again.");
    }
  }
  return <McpConsentCard details={details}>
    <form method="post" action={"/api/inspora/mcp/authorize?ticket=" + encodeURIComponent(ticket)} onSubmit={submit} aria-busy={pending}>
      <input type="hidden" name="ticket" value={ticket} /><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="decision" defaultValue="" />
      <button type="submit" value="deny" disabled={!isLoaded || !isSignedIn || pending}>Cancel</button>
      <button type="submit" value="approve" disabled={!isLoaded || !isSignedIn || pending}>{pending ? "Connecting…" : "Allow connection"}</button>
    </form>
    {!isLoaded ? <p role="status">Preparing secure sign-in…</p> : null}
    {isLoaded && !isSignedIn ? <p role="alert">Sign in again before connecting. Reload this page to continue.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </McpConsentCard>;
}
