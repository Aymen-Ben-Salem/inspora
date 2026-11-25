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

it("shows the commands, the agent prompt and sign-in for each app, and copies what is shown", async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const button = (name: string) => [...element.querySelectorAll<HTMLButtonElement>("button")].find(item => item.textContent?.trim() === name)!;
  const shown = () => element.querySelector("pre")?.textContent ?? "";
  await act(async () => root.render(<McpClientSetup />));
  expect(tab("Claude Code").getAttribute("aria-selected")).toBe("true");
  expect(shown()).toBe("claude plugin marketplace add https://github.com/inspora-design/inspora-plugin.git\nclaude plugin install inspora@inspora-team");
  expect(element.textContent).toContain("plugin:inspora:inspora");
  expect(element.textContent).not.toContain("mcp remove");
  await act(async () => button("Copy").click());
  expect(writeText).toHaveBeenLastCalledWith(shown());

  await act(async () => button("Ask your agent").click());
  expect(shown()).toMatch(/^Install the Inspora plugin[\s\S]*claude plugin install inspora@inspora-team/);
  await act(async () => button("Copy").click());
  expect(writeText).toHaveBeenLastCalledWith(shown());

  await act(async () => tab("Codex").click());
  expect(tab("Codex").getAttribute("aria-selected")).toBe("true");
  expect(shown()).toContain("codex plugin add inspora@inspora-team");
  expect(element.textContent).toContain("codex mcp login inspora");
  expect(element.textContent).not.toContain("claude plugin install");
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
