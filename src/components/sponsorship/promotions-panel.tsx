"use client";
import { useEffect, useState } from "react";
import { SponsoredPostCard } from "@/components/sponsored-post-card";
import type { PromoLabel } from "@/features/sponsorship/promo-label";
import type { PromotionsView } from "@/features/sponsorship/promotions";
import { sponsorButton } from "./button-styles";
import { PromoLabelSettings, visiblePromoLabel } from "./promo-label-settings";
import styles from "./dashboard.module.css";

type Load = { state: "loading" } | { state: "failed" } | { state: "ready"; saved: PromotionsView };

/**
 * Account promotions shown over whichever campaign is public. Shared by the
 * sponsor dashboard and admins; `endpoint` decides whose account is edited.
 */
export function PromotionsPanel({ endpoint, active = true, admin = false }: { endpoint: string; active?: boolean; admin?: boolean }) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [draft, setDraft] = useState<PromoLabel | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; failed?: boolean; conflict?: boolean } | null>(null);
  const loading = load.state === "loading";
  // Load when the tab is first shown, and again after a conflict reload.
  useEffect(() => {
    if (!active || !loading) return;
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok || !body.ok) throw new Error();
        setLoad({ state: "ready", saved: body.value });
        setDraft(body.value.label);
      })
      .catch(() => { if (!controller.signal.aborted) setLoad({ state: "failed" }); });
    return () => controller.abort();
  }, [active, loading, endpoint]);
  if (load.state === "loading") return <div role="status" className={`${styles.surface} text-sm ${styles.muted}`}>Loading promotions…</div>;
  if (load.state === "failed") return <p role="status" className={styles.empty}>Promotions are unavailable right now. Refresh to try again.</p>;
  const { saved } = load;
  const changed = JSON.stringify(draft) !== JSON.stringify(saved.label);
  const readonly = saved.readonly;
  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: draft, expectedRevision: saved.revision }),
      });
      const body = await response.json();
      if (!body.ok) {
        setFeedback({ text: body.message ?? "Couldn’t save. Try again.", failed: true, conflict: response.status === 409 });
        return;
      }
      setLoad({ state: "ready", saved: body.value });
      setDraft(body.value.label);
      setFeedback({ text: draft?.enabled ? "Saved. The label is live on the public campaign." : "Saved. No label is showing." });
    } catch {
      setFeedback({ text: "Couldn’t save. Check your connection and try again.", failed: true });
    } finally {
      setSaving(false);
    }
  }
  const campaign = saved.campaign;
  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className={styles.surface} aria-label="Sale label settings">
        <PromoLabelSettings value={draft} disabled={saving || readonly} onChange={next => { setDraft(next); setFeedback(null); }} />
        {readonly ? <p className={`mt-6 text-sm ${styles.muted}`}>Promotions are read-only because the paid period has ended.</p> : (
          <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-[#f0f0f0] pt-6">
            <button type="button" disabled={!changed || saving} onClick={() => void save()} className={`${sponsorButton.primary} ${styles.primaryButton}`}>
              {saving ? "Saving…" : "Save changes"}
            </button>
            {changed && !saving ? <button type="button" onClick={() => { setDraft(saved.label); setFeedback(null); }} className={`${sponsorButton.secondary} ${styles.secondaryButton}`}>Discard</button> : null}
            <p role={feedback?.failed ? "alert" : "status"} aria-live="polite" className={`text-sm ${feedback?.failed ? "text-[#b42318]" : styles.muted}`}>
              {feedback?.text ?? (changed ? "Unsaved changes" : "")}
              {feedback?.conflict ? <> <button type="button" className="focus-ring cursor-pointer underline underline-offset-4" onClick={() => { setLoad({ state: "loading" }); setFeedback(null); }}>Reload</button></> : null}
            </p>
          </div>
        )}
      </section>
      <section className={styles.surface} aria-labelledby="promotions-preview-title">
        <h2 id="promotions-preview-title" className="text-lg font-medium">Preview</h2>
        <p className={`mt-1 text-sm ${styles.muted}`}>
          {campaign ? `On ${admin ? "the" : "your"} live campaign, ${campaign.title}. It stays on whichever campaign is live.` : "No campaign is live right now. The label appears on whichever campaign is published next."}
        </p>
        <div className="mt-5">
          <SponsoredPostCard sponsor={{
            id: "promotions-preview",
            title: campaign?.title ?? "Your campaign",
            url: campaign?.url ?? "https://example.com",
            mediaType: campaign?.mediaType === "video" ? "video" : "image",
            mediaUrl: campaign?.mediaUrl ?? undefined,
            mediaPosterUrl: campaign?.mediaPosterUrl ?? undefined,
            mediaWidth: campaign?.mediaWidth ?? 1200,
            mediaHeight: campaign?.mediaHeight ?? 800,
            mediaAlt: campaign ? `${campaign.title} preview` : "Campaign preview",
            iconUrl: campaign?.iconUrl ?? undefined,
            promoLabel: visiblePromoLabel(draft),
          }} />
        </div>
      </section>
    </div>
  );
}
