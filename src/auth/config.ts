export function isClerkConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
  );
}

function toOrigin(value: string | undefined) {
  if (!value) return undefined;

  try {
    const candidate = value.includes("://") ? value : `https://${value}`;
    return new URL(candidate).origin;
  } catch {
    return undefined;
  }
}

export function getClerkAuthorizedParties() {
  return Array.from(
    new Set(
      [
        toOrigin(process.env.SITE_URL),
        toOrigin(process.env.VERCEL_URL),
        toOrigin(process.env.VERCEL_BRANCH_URL),
        toOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
      ].filter((origin): origin is string => Boolean(origin)),
    ),
  );
}

function isClerkUserId(userId: string) {
  return userId.startsWith("user_") && userId !== "user_REPLACE_ME";
}

export function getConfiguredAdminUserIds() {
  return new Set(
    (process.env.ADMIN_USER_IDS ?? "")
      .split(",")
      .map((userId) => userId.trim())
      .filter(isClerkUserId),
  );
}

export function isAdminAccessConfigured() {
  return isClerkConfigured() && getConfiguredAdminUserIds().size > 0;
}
