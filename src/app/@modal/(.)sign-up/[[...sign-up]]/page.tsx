import { PublicAuthPage } from "@/components/auth/public-auth-page";

export default function InterceptedSignUpPage() {
  return <PublicAuthPage flow="sign-up" overlay />;
}
