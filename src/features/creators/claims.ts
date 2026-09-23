import "server-only";

// Compatibility for existing approval callers; identity owns every decision.
export { reviewCreatorOwnershipClaim as reviewCreatorClaim } from "./identity";
