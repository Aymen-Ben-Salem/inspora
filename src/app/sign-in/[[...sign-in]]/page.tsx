import { SignIn } from "@clerk/nextjs";

import { isClerkConfigured } from "@/auth/config";

export default function SignInPage() {
  if (!isClerkConfigured()) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#f5f5f2] px-5">
        <div className="max-w-md rounded-2xl border border-black/10 bg-white p-8">
          <p className="text-xs uppercase tracking-[0.16em] text-[#777]">Admin setup</p>
          <h1 className="mt-3 text-2xl font-medium tracking-[-0.03em]">
            Clerk is not configured yet.
          </h1>
          <p className="mt-3 leading-relaxed text-[#666]">
            Add the Clerk publishable key and secret key to your environment before signing in.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#f5f5f2] px-5 py-12">
      <SignIn />
    </main>
  );
}
