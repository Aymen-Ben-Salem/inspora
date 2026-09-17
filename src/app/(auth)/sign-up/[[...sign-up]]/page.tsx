import type { Metadata } from "next";

import { PublicAuthBackdrop } from "@/components/auth/public-auth-backdrop";
import { PublicAuthPage } from "@/components/auth/public-auth-page";
import { publicAuthRedirect } from "@/auth/public-auth-redirect";

export const metadata: Metadata = { title: "Sign up" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const params = await searchParams;
  return (
    <PublicAuthPage
      flow="sign-up"
      backdrop={<PublicAuthBackdrop />}
      redirectUrl={publicAuthRedirect(params.redirect_url)}
    />
  );
}
