import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createDraftSuggestionBudget } from "./draft-suggestion-budget";
const request = (ip = "203.0.113.10") => new Request("https://preview.example", { headers: { "x-vercel-forwarded-for": ip } });
it("bounds concurrent imports and releases each slot only once", () => {
  const reserve = createDraftSuggestionBudget();
  const first = reserve(request())!, second = reserve(request())!;
  expect(reserve(request())).toBeNull();
  first(); first();
  const third = reserve(request())!;
  expect(third).toBeTypeOf("function");
  expect(reserve(request())).toBeNull();
  second(); third();
});
it("limits repeat lookups and clears the bounded client window after one minute", () => {
  let now = 0;
  const reserve = createDraftSuggestionBudget(() => now);
  for (let i = 0; i < 5; i++) reserve(request())!();
  expect(reserve(request())).toBeNull();
  expect(reserve(request("203.0.113.11"))).toBeTypeOf("function");
  now = 60_000;
  expect(reserve(request())).toBeTypeOf("function");
});
it("bounds per-instance traffic even across different or spoofed client headers", () => {
  const reserve = createDraftSuggestionBudget();
  for (let i = 0; i < 30; i++) reserve(request(String(i)))!();
  expect(reserve(request("new-client"))).toBeNull();
});
