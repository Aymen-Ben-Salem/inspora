import type { Metadata } from "next";

import { PublicAuthBackdrop } from "@/components/auth/public-auth-backdrop";
import { PublicAuthPage } from "@/components/auth/public-auth-page";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return <PublicAuthPage flow="sign-in" backdrop={<PublicAuthBackdrop />} />;
}
