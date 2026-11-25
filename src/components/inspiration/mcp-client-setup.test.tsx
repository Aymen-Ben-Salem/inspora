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
  const button = (name: string) => [...element.querySelectorAll<HTMLButtonElement>("button")].find(item => (item.getAttribute("aria-label") ?? item.textContent?.trim()) === name)!;
  const commands = () => [...element.querySelectorAll("[aria-label='Install commands'] code")].map(code => code.textContent);
  const prompt = () => element.querySelector("pre")?.textContent ?? "";
  await act(async () => root.render(<McpClientSetup />));
  expect(tab("Claude Code").getAttribute("aria-selected")).toBe("true");
  expect(commands()).toEqual([
    "/plugin marketplace add inspora-design/inspora-plugin",
    "/plugin install inspora@inspora-team",
  ]);
  expect(element.textContent).toContain("plugin:inspora:inspora");
  expect(element.textContent).not.toContain("mcp remove");
  // Each command has its own copy button and copies only that command.
  await act(async () => button("Copy command 2").click());
  expect(writeText).toHaveBeenLastCalledWith("/plugin install inspora@inspora-team");

  // The agent prompt uses the shell form, since an agent cannot type slash commands.
  await act(async () => button("Ask your agent").click());
  expect(prompt()).toMatch(/^Install the Inspora plugin[\s\S]*claude plugin marketplace add inspora-design\/inspora-plugin[\s\S]*claude plugin install inspora@inspora-team/);
  await act(async () => button("Copy").click());
  expect(writeText).toHaveBeenLastCalledWith(prompt());

  await act(async () => tab("Codex").click());
  expect(tab("Codex").getAttribute("aria-selected")).toBe("true");
  expect(prompt()).toContain("codex plugin add inspora@inspora-team");
  expect(element.textContent).toContain("codex mcp login inspora");
  expect(element.textContent).not.toContain("claude plugin install");
  await act(async () => button("Terminal").click());
  expect(commands()).toEqual(["codex plugin marketplace add inspora-design/inspora-plugin", "codex plugin add inspora@inspora-team"]);
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
