import { z } from "zod";

export const editorialFields = {
  design: ["description", "category", "industries", "styles", "colors"],
  logo: ["description", "industry", "styles", "colors"],
  icon: ["description", "industry", "styles", "colors"],
  website: ["description", "tagline", "categories", "themes", "colors"],
} as const;

export type EditorialKind = keyof typeof editorialFields;
export type EditorialField = (typeof editorialFields)[EditorialKind][number];
export type EditorialValues = Partial<Record<EditorialField, string>>;
export type EditorialTaxonomy = Partial<Record<EditorialField, string[]>>;

const classificationFields = new Set<EditorialField>([
  "category", "industries", "industry", "styles", "colors", "categories", "themes",
]);
const singleFields = new Set<EditorialField>(["category", "industry"]);

export const editorialProposalSchema = z.object({
  fields: z.array(z.object({
    field: z.enum([
      "description", "tagline", "category", "industries", "industry",
      "styles", "colors", "categories", "themes",
    ]),
    value: z.string().trim().max(4000),
    reason: z.string().trim().min(1).max(400),
  }).strict()).max(6),
  hiddenNotes: z.object({
    scope: z.enum(["component", "webpage", "brand", "motion", "illustration", "object", "icon", "interface", "lettering"]),
    visualNotes: z.string().trim().min(10).max(1400),
    typography: z.string().trim().min(10).max(500).nullable(),
    typographyIsSubject: z.boolean(),
  }).strict(),
  uncertainty: z.array(z.string().trim().min(1).max(400)).max(10),
}).strict();

export type EditorialProposal = z.infer<typeof editorialProposalSchema>;

export function validateEditorialProposal(
  input: unknown,
  kind: EditorialKind,
  taxonomy: EditorialTaxonomy,
): EditorialProposal {
  const proposal = editorialProposalSchema.parse(input);
  const supported: readonly string[] = editorialFields[kind];
  const seen = new Set<string>();
  for (const change of proposal.fields) {
    if (!supported.includes(change.field) || seen.has(change.field)) {
      throw new Error("Suggestion contains an unsupported or repeated field.");
    }
    seen.add(change.field);
    if (change.field === "description" && change.value.length > 600) {
      throw new Error("The public description must stay concise.");
    }
    if (change.field === "tagline" && change.value.length > 300) {
      throw new Error("The feed description is too long.");
    }
    if (classificationFields.has(change.field)) {
      const labels = (singleFields.has(change.field) ? [change.value] : change.value.split(","))
        .map((label) => label.trim()).filter(Boolean);
      const allowed = taxonomy[change.field] ?? [];
      if (labels.length > 8 || new Set(labels).size !== labels.length ||
          (singleFields.has(change.field) && labels.length > 1) ||
          labels.some((label) => !allowed.includes(label))) {
        throw new Error("Suggestion contains a classification outside the existing taxonomy.");
      }
      change.value = labels.join(", ");
    }
  }
  const notes = proposal.hiddenNotes;
  const composition = ["webpage", "brand", "interface", "lettering"].includes(notes.scope);
  if (notes.typography && !composition && !notes.typographyIsSubject) {
    throw new Error("Typography requires an overall composition or lettering subject.");
  }
  return proposal;
}

/** Produce a patch for selected fields only, rejecting edits made after generation. */
export function selectedEditorialPatch({
  proposal, selected, before, current, sourceVersion, currentSourceVersion,
}: {
  proposal: EditorialProposal;
  selected: EditorialField[];
  before: EditorialValues;
  current: EditorialValues;
  sourceVersion: string;
  currentSourceVersion: string;
}): EditorialValues {
  if (sourceVersion !== currentSourceVersion) {
    throw new Error("The work changed. Generate suggestions again.");
  }
  const patch: EditorialValues = {};
  for (const field of new Set(selected)) {
    const suggestion = proposal.fields.find((change) => change.field === field);
    if (!suggestion) throw new Error("Selected suggestion is unavailable.");
    if ((current[field] ?? "") !== (before[field] ?? "")) {
      throw new Error("A selected field changed. Review the current value first.");
    }
    patch[field] = suggestion.value;
  }
  return patch;
}
