import type { Metadata } from "next";

import { PublicAuthPage } from "@/components/auth/public-auth-page";

export const metadata: Metadata = { title: "Sign up" };

export default function SignUpPage() {
  return <PublicAuthPage flow="sign-up" />;
}
