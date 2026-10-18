import { websiteFixture } from "./fixtures";
type Row = ReturnType<typeof websiteFixture>;

export const incompletePresentations: { name: string; change: (row: Row) => void }[] = [
  { name: "missing recording", change: r => { r.media = r.media.filter(m => m.role !== "recording"); } },
  { name: "missing poster", change: r => { r.media[0].posterUrl = null; } },
  { name: "empty poster", change: r => { r.media[0].posterUrl = ""; } },
  { name: "null preview", change: r => { r.media[0].videoPreview = null; } },
  { name: "missing favicon", change: r => { r.media = r.media.filter(m => m.role !== "favicon"); } },
];
