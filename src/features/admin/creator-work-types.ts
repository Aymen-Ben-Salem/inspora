export type AdminCreatorWork = {
  id: string;
  kind: "design" | "logo" | "app-icon" | "website";
  title: string;
  status: "draft" | "published" | "archived";
  createdAt: string;
  thumbnailUrl: string | null;
  thumbnailAlt: string;
};

export type AdminCreatorWorkPage = {
  items: AdminCreatorWork[];
  nextCursor: string | null;
};
