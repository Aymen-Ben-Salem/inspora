import { PublicAuthPage } from "@/components/auth/public-auth-page";

export default function InterceptedSignInPage() {
  return <PublicAuthPage flow="sign-in" overlay />;
}
