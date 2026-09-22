import type { PostCategory } from "@/domain/post";
import type { WorkCardData } from "@/domain/work-card";
export type { ResolvedCreatorProfile } from "@/features/creators/types";

export type CreatorWorkFilter =
  | "all"
  | "websites"
  | "logos"
  | "app-icons"
  | PostCategory;

export type CreatorWorkQuery = {
  creatorId: string;
  filter: CreatorWorkFilter;
  cursor?: string;
};

export type CreatorWorkPage = {
  items: WorkCardData[];
  nextCursor: string | null;
};

export type ProfileWorkCounts = {
  total: number;
  filters: Partial<Record<Exclude<CreatorWorkFilter, "all">, number>>;
};

export type ProfileEditInput = {
  name?: string;
  username?: string;
  websiteUrl?: string | null;
};

export type ProfileEditResult =
  | { ok: true }
  | {
      ok: false;
      field: "name" | "username" | "websiteUrl" | "form";
      message: string;
    };
