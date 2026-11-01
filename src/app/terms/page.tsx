import type { Metadata } from "next";

import { PolicyPage } from "@/components/policy-page";
import { termsPolicy } from "@/lib/site-policies";

export const metadata: Metadata = {
  title: termsPolicy.title,
  description: termsPolicy.description,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  return <PolicyPage policy={termsPolicy} />;
}
