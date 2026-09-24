"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";

import { closeArchiveDetail, openArchiveDetail, type DetailQuerySelection } from "@/lib/detail-query";

export function useArchiveDetail(key: DetailQuerySelection["key"]) {
  const searchParams = useSearchParams();
  const select = useCallback((slug: string) => openArchiveDetail({ key, value: slug }), [key]);

  // Next synchronizes native history updates and Back/Forward with these params.
  // Deriving selection here also prevents retained archives reopening old details.
  return { selectedSlug: searchParams.get(key), select, close: closeArchiveDetail };
}
