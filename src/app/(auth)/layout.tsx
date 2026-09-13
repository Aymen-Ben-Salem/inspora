import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true },
};

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <main className="min-h-[100dvh] bg-white text-[#262626]">{children}</main>;
}
