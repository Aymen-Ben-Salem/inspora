import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";
import { publicAuthRedirect } from "@/auth/public-auth-redirect";

export default async function XClaimCallback({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const path = publicAuthRedirect((await searchParams).returnTo);
  const destination = /^\/creators\/[a-z0-9_]+\/claim$/.test(path) ? path : "/profile/claim-match";
  return <AuthenticateWithRedirectCallback signInUrl="/sign-in" signUpUrl="/sign-up" signInForceRedirectUrl={destination} signUpForceRedirectUrl={destination} />;
}
