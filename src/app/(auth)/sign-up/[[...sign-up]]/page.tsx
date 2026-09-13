import type { Metadata } from "next";

import { PublicAuthBackdrop } from "@/components/auth/public-auth-backdrop";
import { PublicAuthPage } from "@/components/auth/public-auth-page";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return <PublicAuthPage flow="sign-up" backdrop={<PublicAuthBackdrop />} />;
}
