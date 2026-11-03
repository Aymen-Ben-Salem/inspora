import type { PreviewFields } from "./campaign-preview";
import type { SponsorContact, VerifiedSponsorAsset } from "@/features/sponsorship/types";
import type { SponsorBillingMode } from "@/features/sponsorship/purchase-mode";

export type LocalUploadRole = "media" | "icon" | "wordmark" | "poster";
export type LocalFiles = Partial<Record<LocalUploadRole, File>>;
export type LocalCampaignDraft = {
  ownerUserId: string | null;
  fields: PreviewFields;
  contact: SponsorContact;
  billingMode: SponsorBillingMode;
  files: LocalFiles;
  expiresAt: number;
};
const key = "inspora:sponsor-draft";
const database = "inspora-sponsor-drafts";
const maxAge = 24 * 3600000;
export function validateLocalFile(file: File, role: LocalUploadRole) {
  const image = ["image/png", "image/jpeg", "image/webp", "image/avif"];
  const video = ["video/mp4", "video/webm"].includes(file.type);
  if (!(image.includes(file.type) || (role === "media" && (video || file.type === "image/gif"))) ||
    file.size <= 0 || file.size > (video ? 50 : 10) * 1024 * 1024)
    throw new Error("Choose a supported image up to 10 MiB or feed video up to 50 MiB.");
}
export function localPreviewAsset(file: File, role: LocalUploadRole): VerifiedSponsorAsset {
  validateLocalFile(file, role);
  // Local-only presentation: these IDs are never accepted by the upload/save API.
  return { id: "local-" + role, kind: role, contentType: file.type, sizeBytes: file.size,
    width: 1200, height: 800, digest: "", url: URL.createObjectURL(file) };
}
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("drafts");
    request.onerror = () => reject(new Error("Your browser could not preserve this draft. Allow site storage and try again."));
    request.onblocked = () => reject(new Error("Close other sponsor preparation tabs and try again."));
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("drafts", "readwrite");
      const cursor = tx.objectStore("drafts").openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        if (!Number.isFinite(row.value?.expiresAt) || row.value.expiresAt <= Date.now()) row.delete();
        row.continue();
      };
      tx.oncomplete = () => resolve(db);
      tx.onerror = tx.onabort = () => { db.close(); reject(new Error("Your browser could not open draft storage. Try again.")); };
    };
  });
}
async function transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("drafts", mode);
      const request = work(tx.objectStore("drafts"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = tx.onabort = () => reject(new Error("Your browser could not preserve this draft. Allow site storage and try again."));
    });
  } finally { db.close(); }
}
export async function saveLocalDraft(draft: Omit<LocalCampaignDraft, "expiresAt">) {
  for (const [role, file] of Object.entries(draft.files)) validateLocalFile(file, role as LocalUploadRole);
  const id = crypto.randomUUID();
  const previous = sessionStorage.getItem(key);
  await transact("readwrite", store => store.put({ ...draft, expiresAt: Date.now() + maxAge }, id));
  sessionStorage.setItem(key, id);
  sessionStorage.setItem(key + ":email", draft.contact.email);
  if (previous) await transact("readwrite", store => store.delete(previous));
}
export function pendingDraftEmail() {
  try { return sessionStorage.getItem(key + ":email") ?? ""; } catch { return ""; }
}
export function draftMatchesOwner(draft: LocalCampaignDraft, owner: string | null, email: string, now = Date.now()) {
  return draft.expiresAt > now && draft.expiresAt <= now + maxAge &&
    (draft.ownerUserId === null || draft.ownerUserId === owner) &&
    draft.contact.email.trim().toLowerCase() === email.trim().toLowerCase();
}
export async function readLocalDraft(owner: string | null, email: string) {
  const id = sessionStorage.getItem(key);
  if (!id) return null;
  const draft = await transact<LocalCampaignDraft | undefined>("readonly", store => store.get(id));
  if (!draft || draft.expiresAt <= Date.now()) { await clearLocalDraft(); return null; }
  if (!draftMatchesOwner(draft, owner, email)) {
    throw new Error("Sign in with the email entered for this campaign to restore it. Your draft is still saved in this browser tab.");
  }
  return draft;
}
export async function clearLocalDraft() {
  const id = sessionStorage.getItem(key);
  if (id) await transact("readwrite", store => store.delete(id));
  sessionStorage.removeItem(key);
  sessionStorage.removeItem(key + ":email");
}
