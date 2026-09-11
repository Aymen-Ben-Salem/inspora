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

export function normalizeCreatorValidationInput(
  input: unknown,
  dataEnvironment: string | undefined,
) {
  if (typeof input !== "object" || input === null || !("id" in input)) {
    return input;
  }

  const id = typeof input.id === "string" ? input.id : undefined;
  if (!shouldLockExistingCreator(id, dataEnvironment)) return input;

  return {
    id,
    name: "Existing creator",
    url: "",
    avatarUrl: "/brand/default-avatar.svg",
  };
}
