import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata, Route } from "next";
export const metadata: Metadata = {
  title: "Verify sponsor access",
  robots: { index: false, follow: false },
};
async function Verify() {
  return redirect("/api/sponsorship/verify" as Route);
}
export default function Page() {
  return (
    <main className="p-8">
      <Suspense fallback={<p>Verifying sponsor access…</p>}>
        <Verify />
      </Suspense>
    </main>
  );
}
