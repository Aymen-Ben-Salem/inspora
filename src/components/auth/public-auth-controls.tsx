import "server-only";

import { isClerkConfigured } from "../../auth/config";
import { PublicAuthControlsClient } from "./public-auth-controls-client";

export function PublicAuthControls({
  variant,
}: {
  variant: "desktop" | "mobile";
}) {
  if (!isClerkConfigured()) return null;

  return <PublicAuthControlsClient variant={variant} />;
}
