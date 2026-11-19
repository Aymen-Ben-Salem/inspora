export type EnrichmentEntry = {
  id: string;
  sourceFingerprint: string;
  scope: "component" | "webpage" | "brand" | "motion" | "illustration" | "object" | "icon" | "interface" | "lettering";
  visualNotes: string;
  typography: string | null;
  typographyIsSubject: boolean;
  evidence: { mediaMetadataSha256: string; primarySha256: string; frameSha256: string[]; reviewedAt: string };
};
export function stable(value: unknown): string;
export function mediaFingerprint(row: Record<string, unknown>): string;
export function sourceFingerprint(row: Record<string, unknown>): string;
export function parseEnrichment(input?: unknown): { version: 1; entries: EnrichmentEntry[] };
export function currentEnrichment(row: Record<string, unknown>, entry: EnrichmentEntry | undefined | null): boolean;
