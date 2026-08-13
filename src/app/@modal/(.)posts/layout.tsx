import { cacheLife } from "next/cache";
import type { ReactNode } from "react";

import { PostDialog } from "@/components/post-dialog";

export default async function InterceptedPostLayout({
  children,
}: {
  children: ReactNode;
}) {
  "use cache";

  cacheLife({
    stale: 300,
    revalidate: 21_600,
    expire: 604_800,
  });

  return <PostDialog closeMode="back">{children}</PostDialog>;
}
