/** Categories share URLs with work-kind filters, so those names are reserved. */
const reservedNames = new Set(["all", "logos", "websites", "app-icons", "in-review"]);

export function normalizeCategoryName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function isCategoryName(value: string) {
  return value.length > 0 && value.length <= 60 &&
    value === normalizeCategoryName(value) &&
    !/[\u0000-\u001f\u007f]/.test(value) &&
    !reservedNames.has(value.toLowerCase());
}
