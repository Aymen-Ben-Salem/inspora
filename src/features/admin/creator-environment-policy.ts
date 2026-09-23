export const DEVELOPMENT_CREATOR_HANDLE_PREFIX = "dev-";

export function isDevelopmentFixtureCreator(
  legacyHandle: string | null | undefined,
) {
  return Boolean(
    legacyHandle
      ?.trim()
      .toLowerCase()
      .startsWith(DEVELOPMENT_CREATOR_HANDLE_PREFIX),
  );
}

export function isCreatorVisibleInEnvironment(
  legacyHandle: string | null | undefined,
  dataEnvironment: string | undefined,
) {
  return (
    dataEnvironment === "development" ||
    !isDevelopmentFixtureCreator(legacyHandle)
  );
}

export function shouldLockExistingCreator(
  creator:
    | { id: string | undefined; recordOrigin?: string | null }
    | undefined,
  dataEnvironment: string | undefined,
) {
  return (
    dataEnvironment === "preview" &&
    Boolean(creator?.id) &&
    creator?.recordOrigin !== "preview"
  );
}

export function normalizeCreatorValidationInput(
  input: unknown,
  dataEnvironment: string | undefined,
) {
  if (typeof input !== "object" || input === null || !("id" in input)) {
    return input;
  }

  const id = typeof input.id === "string" ? input.id : undefined;
  const recordOrigin =
    "recordOrigin" in input && typeof input.recordOrigin === "string"
      ? input.recordOrigin
      : undefined;
  if (!shouldLockExistingCreator({ id, recordOrigin }, dataEnvironment)) {
    return input;
  }

  return {
    id,
    name: "Existing creator",
    legacyHandle: "",
    username: "",
    url: "",
    xProfileUrl: "",
    avatarUrl: "/brand/default-avatar.svg",
    recordOrigin,
  };
}
