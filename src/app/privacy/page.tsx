import type { Metadata } from "next";

import { PolicyPage } from "@/components/policy-page";
import { privacyPolicy } from "@/lib/site-policies";

export const metadata: Metadata = {
  title: privacyPolicy.title,
  description: privacyPolicy.description,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return <PolicyPage policy={privacyPolicy} />;
}
