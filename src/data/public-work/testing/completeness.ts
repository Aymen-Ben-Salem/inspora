import { websiteFixture } from "./fixtures";
type Row = ReturnType<typeof websiteFixture>;

export const incompletePresentations: { name: string; change: (row: Row) => void }[] = [
  { name: "missing recording", change: r => { r.media = r.media.filter(m => m.role !== "recording"); } },
  { name: "missing poster", change: r => { r.media[0].posterUrl = null; } },
  { name: "empty poster", change: r => { r.media[0].posterUrl = ""; } },
  { name: "null preview", change: r => { r.media[0].videoPreview = null; } },
  { name: "missing favicon", change: r => { r.media = r.media.filter(m => m.role !== "favicon"); } },
  { name: "no sections", change: r => { r.sections = []; } },
  { name: "null image", change: r => { r.sections[0].imageUrl = null; } },
  { name: "empty image", change: r => { r.sections[0].imageUrl = ""; } },
  { name: "null width", change: r => { r.sections[0].imageWidth = null; } },
  { name: "null height", change: r => { r.sections[0].imageHeight = null; } },
  { name: "zero width", change: r => { r.sections[0].imageWidth = 0; } },
  { name: "zero height", change: r => { r.sections[0].imageHeight = 0; } },
  { name: "one incomplete section", change: r => { r.sections.push({ ...r.sections[0], id: "bad-section", position: 1, imageUrl: "" }); } },
];
