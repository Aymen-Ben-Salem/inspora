import "server-only";

import { SignIn } from "@clerk/nextjs";

import { publicAuthAppearance } from "../../auth/appearance";

export function AdminAuthEntry() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#f5f5f2] px-5 py-12">
      <section aria-label="Sign in to Inspora admin" className="w-full max-w-[429px]">
        <SignIn
          appearance={publicAuthAppearance}
          forceRedirectUrl="/admin/posts"
          routing="hash"
          transferable={false}
          withSignUp={false}
        />
      </section>
    </main>
  );
}
