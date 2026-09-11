export const DEVELOPMENT_CREATOR_HANDLE_PREFIX = "dev-";

export function isDevelopmentFixtureCreator(
  handle: string | null | undefined,
) {
  return Boolean(
    handle
      ?.trim()
      .toLowerCase()
      .startsWith(DEVELOPMENT_CREATOR_HANDLE_PREFIX),
  );
}

export function isCreatorVisibleInEnvironment(
  handle: string | null | undefined,
  dataEnvironment: string | undefined,
) {
  return dataEnvironment === "development" || !isDevelopmentFixtureCreator(handle);
}

export function shouldLockExistingCreator(
  creatorId: string | undefined,
  dataEnvironment: string | undefined,
) {
  return dataEnvironment === "preview" && Boolean(creatorId);
}
