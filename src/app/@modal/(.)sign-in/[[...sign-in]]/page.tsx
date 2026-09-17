import { PublicAuthPage } from "@/components/auth/public-auth-page";
import { publicAuthRedirect } from "@/auth/public-auth-redirect";

export default async function InterceptedSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>;
}) {
  const params = await searchParams;
  return (
    <PublicAuthPage
      flow="sign-in"
      overlay
      redirectUrl={publicAuthRedirect(params.redirect_url)}
    />
  );
}
