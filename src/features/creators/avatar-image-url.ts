// X's default profile_image_url is a 48px thumbnail. Use the same image's
// 400px variant so profile headers also stay sharp on high-density displays.
export function creatorAvatarUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "pbs.twimg.com" ||
      !url.pathname.startsWith("/profile_images/")) return value;
    url.pathname = url.pathname.replace(/_normal(?=\.[a-z0-9]+$)/i, "_400x400");
    return url.href;
  } catch {
    return value;
  }
}
