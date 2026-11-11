export function isMcpPreviewEnabled(values: Record<string, string | undefined> = process.env) {
  return values.VERCEL_ENV !== "production" &&
    (values.DATA_ENVIRONMENT === "preview" || values.VERCEL_ENV === "preview");
}
