import type { Logo } from "./logo";
import type { PostCardData } from "./post";
import type { SavedCategory } from "./saved-post";
import type { Website } from "./website";

export type WorkCardData =
  | (PostCardData & { category: SavedCategory; kind?: "post" })
  | { id: string; category: "Logos"; kind: "logo"; logo: Logo }
  | { id: string; category: "Websites"; kind: "website"; website: Website };
