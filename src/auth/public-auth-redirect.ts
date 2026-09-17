export function publicAuthRedirect(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    !candidate ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes(String.fromCharCode(92))
  ) {
    return "/";
  }
  return candidate;
}
