// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import examples from "./mcp-examples.json";
import { McpClientSetup } from "./mcp-client-setup";

let root: Root, element: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  element = document.createElement("div"); document.body.append(element); root = createRoot(element);
});
afterEach(async () => { await act(async () => root.unmount()); element.remove(); vi.unstubAllGlobals(); });
const tab = (name: string) => [...element.querySelectorAll<HTMLButtonElement>("[role=tab]")].find(button => button.textContent?.trim() === name)!;

it("shows the commands and sign-in, and copies an install prompt, for each app", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const promptButton = () => [...element.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.startsWith("Or copy a prompt"))!;
  await act(async () => root.render(<McpClientSetup />));
  expect(tab("Claude Code").getAttribute("aria-selected")).toBe("true");
  expect(element.textContent).toContain("claude plugin marketplace add https://github.com/inspora-design/inspora-plugin.git");
  expect(element.textContent).toContain("claude plugin install inspora@inspora-team");
  expect(element.textContent).toContain("plugin:inspora:inspora");
  expect(element.textContent).not.toContain("mcp remove");
  await act(async () => promptButton().click());
  expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining("claude plugin install inspora@inspora-team"));

  await act(async () => tab("Codex").click());
  expect(tab("Codex").getAttribute("aria-selected")).toBe("true");
  expect(element.textContent).toContain("codex plugin add inspora@inspora-team");
  expect(element.textContent).toContain("codex mcp login inspora");
  expect(element.textContent).not.toContain("claude plugin install");
  await act(async () => promptButton().click());
  expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining("codex plugin add inspora@inspora-team"));
});

it("credits and links every example reference, design work first", () => {
  expect(examples[0].results.every(work => work.kind === "design")).toBe(true);
  for (const work of examples.flatMap(example => example.results)) {
    expect(work.creator.length).toBeGreaterThan(0);
    expect(work.url).toMatch(/^\/(posts\/|websites\?website=|logos\?logo=)/);
    expect(work.image).toMatch(/^\/mcp\/references\/[a-z0-9-]+\.webp$/);
    expect(work.alt.length).toBeGreaterThan(10);
  }
});
