"use client";
import { useState } from "react";
export function AdminBillingControls({
  checkoutId,
  exception = false,
}: {
  checkoutId: string;
  exception?: boolean;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmRevoke, setConfirmRevoke] = useState(false);
  async function act(action: "retry" | "revoke" | "resolve_exception") {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/sponsorship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutId, action }),
      });
      if (!r.ok) throw Error();
      setMessage(
        action === "revoke"
          ? "Access revoked. Billing termination is queued. Refunds require an explicit decision."
          : action === "retry"
            ? "Retry queued. Refresh to inspect the result."
            : "External resolution acknowledged. Access remains unchanged.",
      );
    } catch {
      setMessage("Action unavailable. Try again.");
    } finally {
      setBusy(false);
      setConfirmRevoke(false);
    }
  }
  return (
    <div className="mt-3 flex flex-wrap gap-3 text-sm">
      <button
        type="button"
        disabled={busy}
        className="focus-ring rounded border px-3 py-2"
        onClick={() => {
          void act("retry");
        }}
      >
        Retry reconciliation
      </button>
      <button
        type="button"
        disabled={busy}
        className="focus-ring rounded border px-3 py-2 text-[#b42318]"
        onClick={() => setConfirmRevoke(true)}
      >
        Revoke access
      </button>
      {confirmRevoke ? (
        <>
          <p className="w-full">
            Immediately hide this sponsor, deny access and stop future billing?
            Refunds are separate.
          </p>
          <button
            type="button"
            disabled={busy}
            className="focus-ring rounded border px-3 py-2"
            onClick={() => {
              void act("revoke");
            }}
          >
            Confirm revocation
          </button>
          <button type="button" onClick={() => setConfirmRevoke(false)}>
            Keep access
          </button>
        </>
      ) : null}
      {exception ? (
        <button
          type="button"
          disabled={busy}
          className="focus-ring rounded border px-3 py-2"
          onClick={() => {
            void act("resolve_exception");
          }}
        >
          Acknowledge completed external refund or resolution
        </button>
      ) : null}
      <p className="w-full" role="status">
        {message}
      </p>
    </div>
  );
}
