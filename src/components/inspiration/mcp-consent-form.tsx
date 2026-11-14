"use client";
import { useAuth } from "@clerk/nextjs";
import { useRef, useState, type FormEvent } from "react";
import styles from "@/app/connect/mcp/page.module.css";

export type McpConsentProps = {
  ticket: string; csrf: string;
  details: { clientName?: string; clientDomain?: string; redirectHost?: string; redirectIsLoopback?: boolean; scope?: string[] };
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
  return <section className={styles.card}>
    <h1>Connect {(details.clientName || "your app").slice(0, 120)}</h1>
    <p>This app can search published inspiration and retrieve descriptions, classifications and selected previews.</p>
    <p>It cannot edit content or access your saved collections, account details or payments.</p>
    {details.scope?.includes("offline_access") ? <p>This connection can stay signed in for up to 30 days, or until revoked.</p> : null}
    <p>Access returns to <strong>{details.redirectHost?.slice(0, 200)}</strong>.</p>
    <small>{details.clientDomain ? <>Client domain: {details.clientDomain.slice(0, 200)}</> : "The app supplied its own name; Inspora has not verified it."}</small>
    {details.redirectIsLoopback ? <p><strong>This connects an app on your computer.</strong> Continue only if you started connecting from that app.</p> : null}
    <form method="post" action={"/api/inspora/mcp/authorize?ticket=" + encodeURIComponent(ticket)} onSubmit={submit} aria-busy={pending}>
      <input type="hidden" name="ticket" value={ticket} /><input type="hidden" name="csrf" value={csrf} /><input type="hidden" name="decision" defaultValue="" />
      <button type="submit" value="deny" disabled={!isLoaded || !isSignedIn || pending}>Cancel</button>
      <button type="submit" value="approve" disabled={!isLoaded || !isSignedIn || pending}>{pending ? "Connecting…" : "Allow connection"}</button>
    </form>
    {!isLoaded ? <p role="status">Preparing secure sign-in…</p> : null}
    {isLoaded && !isSignedIn ? <p role="alert">Sign in again before connecting. Reload this page to continue.</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </section>;
}
