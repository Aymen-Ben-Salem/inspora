"use client";

import { FormEvent, useState } from "react";

import { captureAnalyticsEvent } from "@/analytics/client";
import { ANALYTICS_EVENTS } from "@/analytics/events";

type Status = "idle" | "pending" | "success" | "error";

export function NewsletterForm({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);

    setStatus("pending");
    setMessage("");

    try {
      const response = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.get("email"),
          company: data.get("company"),
          source: compact ? "header" : "post-detail",
        }),
      });
      let payload: { message?: string } = {};
      if (response.headers.get("content-type")?.includes("application/json")) {
        try {
          payload = (await response.json()) as { message?: string };
        } catch {
          // A proxy or firewall can return an empty or malformed error body.
        }
      }

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Too many attempts. Try again in a few minutes.");
        }
        throw new Error(payload.message ?? "Could not subscribe right now.");
      }

      form.reset();
      setStatus("success");
      setMessage("You're on the list.");
      captureAnalyticsEvent(ANALYTICS_EVENTS.newsletterSubscribed, {
        source: compact ? "header" : "post-detail",
      });
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not subscribe right now.");
    }
  }

  if (status === "success") {
    return (
      <p className={compact ? "text-center text-xs text-[#777]" : "text-sm text-[#505050]"} role="status">
        {message}
      </p>
    );
  }

  return (
    <form
      className={`min-w-0 items-center ${compact ? "grid w-full grid-cols-[minmax(0,1fr)_82px] gap-2 sm:flex xl:gap-3" : "flex w-full max-w-[429px] gap-2 lg:gap-2 xl:gap-2.5 min-[1700px]:gap-3"}`}
      onSubmit={handleSubmit}
    >
      <label className="sr-only" htmlFor={compact ? "header-email" : "detail-email"}>
        Email address
      </label>
      <input
        id={compact ? "header-email" : "detail-email"}
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@email.com"
        className={`ios-no-focus-zoom focus-ring min-w-0 flex-1 border border-[#e6e6e6] bg-[#fafafa] text-[13px] tracking-[-0.002em] text-[#555] outline-none transition-colors placeholder:text-[#8b8b8b] focus:border-[#aaa] min-[1700px]:text-[14px] ${
          compact
            ? "h-10 w-full rounded-none px-[11px] sm:h-[41px] sm:flex-1 xl:w-[358px] xl:flex-none min-[1700px]:px-3"
            : "h-10 rounded-none pl-[14px] pr-3 lg:h-9 xl:h-10 min-[1700px]:h-[41px] min-[1700px]:pl-3"
        }`}
      />
      <input
        name="company"
        type="text"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <button
        type="submit"
        disabled={status === "pending"}
        className={`focus-ring shrink-0 bg-[#262626] text-[13px] tracking-[-0.002em] text-white transition-colors hover:bg-black disabled:cursor-wait disabled:opacity-60 min-[1700px]:text-[14px] ${
          compact
            ? "h-10 w-full rounded-none px-2 text-[12px] sm:h-[41px] sm:w-auto sm:px-[11px] sm:text-[13px] xl:w-[119px] xl:px-3"
            : "h-10 w-24 rounded-none px-3 lg:h-9 lg:w-[92px] xl:h-10 xl:w-24 min-[1700px]:h-[41px] min-[1700px]:w-[100px]"
        }`}
      >
        {status === "pending" ? "joining..." : "subscribe"}
      </button>
      {status === "error" ? (
        <span className="sr-only" role="alert">
          {message}
        </span>
      ) : null}
    </form>
  );
}
