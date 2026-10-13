export function isLocalAssetPath(value: string) {
  return value.startsWith("/") && !value.startsWith("//") && !value.includes("\\");
}

export function isLocalOrHttpsAssetUrl(value: string) {
  if (isLocalAssetPath(value)) return true;

  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
