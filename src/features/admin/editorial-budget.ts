// Integer microdollars avoid rounding a stream of small calls down to zero.
export const EDITORIAL_PREVIEW_CAP_MICROS = 5_000_000;
export const EDITORIAL_PRODUCTION_CAP_MICROS = 65_000_000;
export const EDITORIAL_RESERVATION_MICROS = 1_000_000;
export const EDITORIAL_PREVIOUS_TEST_MICROS = 571_836;
export const EDITORIAL_TEST_LIMIT_MICROS = 2_000_000;

export function editorialCost(usage: { input_tokens: number; output_tokens: number }) {
  // Conservative cache-write input rate; no assumed cached-token discount.
  return Math.ceil(usage.input_tokens * 2.5 + usage.output_tokens * 10);
}

export function assertEditorialBudget(spent: number, reserved: number, limit: number) {
  if (spent + reserved + EDITORIAL_RESERVATION_MICROS > limit) {
    throw new Error("The editorial spending limit has been reached. Ask the maintainer to review usage.");
  }
}
