import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { selectedEditorialPatch, validateEditorialProposal } from "./editorial-contract";
import { editorialCacheKey, editorialRequest, requestEditorialProposal, type EditorialGenerationInput } from "./editorial-generation";

const proposal = {
  fields: [{ field: "description", value: "A compact storage interface uses colored blocks to show disk usage.", reason: "Describes the visible interface." }],
  hiddenNotes: { scope: "component", visualNotes: "Colored blocks organize file categories on a dark surface.", typography: null, typographyIsSubject: false },
  uncertainty: [],
};
const bytes = Buffer.from("visual-evidence-fixture");
const input: EditorialGenerationInput = {
  kind: "design", title: "Storage", context: "", current: { description: "Original" },
  sourceVersion: "revision-1", taxonomy: { category: ["Product"], colors: ["Black"] },
  images: [{ dataUrl: `data:image/png;base64,${bytes.toString("base64")}`, sha256: createHash("sha256").update(bytes).digest("hex"), frameSeconds: null }],
};

describe("editorial generation contract", () => {
  it("rejects invented labels, duplicate fields and fields unavailable for the work kind", () => {
    const invalid = { ...proposal, fields: [{ field: "category", value: "Invented", reason: "Guess" }] };
    expect(() => validateEditorialProposal(invalid, "design", input.taxonomy)).toThrow(/taxonomy/);
    expect(() => validateEditorialProposal({ ...invalid, fields: [{ ...invalid.fields[0], value: "Product" }] }, "website", input.taxonomy)).toThrow(/unsupported/);
    expect(() => validateEditorialProposal({ ...proposal, fields: [...proposal.fields, ...proposal.fields] }, "design", {})).toThrow(/repeated/);
  });

  it("leaves uncertain classifications empty and enforces selective typography", () => {
    expect(validateEditorialProposal({ ...proposal, fields: [{ field: "industries", value: "", reason: "Industry is uncertain" }] }, "design", {}).fields[0].value).toBe("");
    const typography = { ...proposal, hiddenNotes: { ...proposal.hiddenNotes, typography: "Heavy geometric sans-serif lettering." } };
    expect(() => validateEditorialProposal(typography, "design", {})).toThrow(/Typography/);
    expect(() => validateEditorialProposal({ ...typography, hiddenNotes: { ...typography.hiddenNotes, scope: "brand" } }, "design", {})).not.toThrow();
  });

  it("applies only selected fields and rejects newer edits or changed evidence", () => {
    const validated = validateEditorialProposal(proposal, "design", {});
    const args = { proposal: validated, selected: ["description"] as const, before: input.current, current: input.current, sourceVersion: "one", currentSourceVersion: "one" };
    expect(selectedEditorialPatch({ ...args, selected: [...args.selected] })).toEqual({ description: proposal.fields[0].value });
    expect(() => selectedEditorialPatch({ ...args, selected: [...args.selected], current: { description: "Team edit" } })).toThrow(/selected field changed/);
    expect(() => selectedEditorialPatch({ ...args, selected: [], currentSourceVersion: "two" })).toThrow(/work changed/);
    expect(input.current.description).toBe("Original");
  });

  it("keys cached suggestions by evidence, taxonomy, source and model", () => {
    const key = editorialCacheKey(input, "model-a");
    expect(editorialCacheKey({ ...input, taxonomy: { colors: ["Black"], category: ["Product"] } }, "model-a")).toBe(key);
    expect(editorialCacheKey(input, "model-b")).not.toBe(key);
    expect(editorialCacheKey({ ...input, sourceVersion: "revision-2" }, "model-a")).not.toBe(key);
    expect(editorialCacheKey({ ...input, taxonomy: { colors: ["Blue"] } }, "model-a")).not.toBe(key);
    expect(() => editorialRequest({ ...input, images: [{ ...input.images[0], sha256: "bad" }] }, "model-a")).toThrow(/fingerprint/);
    expect(() => editorialRequest({ ...input, images: [] }, "model-a")).toThrow(/limits/);
  });

  it("uses supplied image evidence, bounded output and structured responses", () => {
    const request = editorialRequest(input);
    expect(request.model).toBe("gpt-6.1-sol");
    expect(request.reasoning).toEqual({ effort: "medium" });
    expect(request.service_tier).toBe("default");
    expect(request.store).toBe(false);
    expect(request.max_output_tokens).toBe(2500);
    expect(request.text.format.strict).toBe(true);
    expect(request.input[0].content[1]).toMatchObject({ type: "input_image", image_url: input.images[0].dataUrl });
  });

  it("records reported usage and rejects failed/incomplete responses without automatic retries", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      id: "response-1", status: "completed", usage: { input_tokens: 100, output_tokens: 60 },
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(proposal) }] }],
    })));
    const result = await requestEditorialProposal(input, { apiKey: "test-key", fetcher });
    const sentBody = JSON.parse(fetcher.mock.calls[0][1]?.body as string);
    expect(sentBody).toMatchObject({ model: "gpt-6.1-sol", reasoning: { effort: "medium" } });
    expect(result.cacheKey).toBe(editorialCacheKey(input));
    expect(result.usage).toEqual({ input_tokens: 100, output_tokens: 60 });
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValue(new Response("provider detail containing credentials", { status: 429 }));
    await expect(requestEditorialProposal(input, { apiKey: "test-key", model: "model-a", fetcher })).rejects.toThrow("Generation failed");
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockResolvedValue(new Response(JSON.stringify({ status: "incomplete" })));
    await expect(requestEditorialProposal(input, { apiKey: "test-key", model: "model-a", fetcher })).rejects.toThrow();
  });
});
