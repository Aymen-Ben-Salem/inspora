import type { Metadata, Route } from "next";
import { redirect } from "next/navigation";
export const metadata: Metadata = {
  title: "Your campaigns",
  robots: { index: false, follow: false, nocache: true },
};
export default function Page() {
  redirect("/sponsor/dashboard?section=campaigns" as Route);
}
