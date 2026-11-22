import { z } from "zod";
import type { SponsorPromoLabel } from "@/domain/sponsor";

export const PROMO_LABEL_TEXT_MAX = 32;
const hexColor = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Use six-digit hex colours, such as #be185d.")
  .transform((value) => value.toLowerCase());

/** A campaign's optional promotional label, frozen into each campaign version. */
export const promoLabelSchema = z
  .object({
    enabled: z.boolean(),
    text: z
      .string()
      .trim()
      .max(PROMO_LABEL_TEXT_MAX, `Keep the label to ${PROMO_LABEL_TEXT_MAX} characters or fewer.`),
    textColor: hexColor,
    backgroundColor: hexColor,
    borderColor: hexColor,
  })
  .strict()
  .refine((label) => !label.enabled || label.text.length > 0, {
    message: "Add label text or turn the label off.",
    path: ["text"],
  });
export type PromoLabel = z.output<typeof promoLabelSchema>;

export const PROMO_LABEL_PRESETS = {
  light: { textColor: "#be185d", backgroundColor: "#fcecf6", borderColor: "#f6cfe3" },
  dark: { textColor: "#f38bbb", backgroundColor: "#2e081d", borderColor: "#5c1f3d" },
} as const satisfies Record<string, Omit<SponsorPromoLabel, "text">>;

export const DEFAULT_PROMO_LABEL: PromoLabel = {
  enabled: true,
  text: "20% OFF Black Friday",
  ...PROMO_LABEL_PRESETS.light,
};

/** Public fields for a stored label, or nothing when it is off or malformed. */
export function publicPromoLabel(value: unknown): SponsorPromoLabel | undefined {
  const parsed = promoLabelSchema.safeParse(value);
  if (!parsed.success || !parsed.data.enabled) return undefined;
  const { enabled: _enabled, ...label } = parsed.data;
  void _enabled;
  return label;
}
