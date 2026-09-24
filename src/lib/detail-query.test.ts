import { afterEach, describe, expect, it, vi } from "vitest";

import { closeArchiveDetail, openArchiveDetail } from "./detail-query";

function browserAt(href: string) {
  const entries = [{ href, state: null as unknown }];
  let index = 0;
  const location = new URL(href, "https://example.test");
  const navigate = () => { location.href = new URL(entries[index].href, location.origin).href; };
  const history = {
    get state() { return entries[index].state; },
    pushState(state: unknown, _title: string, href: string) {
      entries.splice(index + 1);
      entries.push({ href, state }); index++; navigate();
    },
    replaceState(state: unknown, _title: string, href: string) {
      entries[index] = { href, state }; navigate();
    },
    back: vi.fn(() => { if (index > 0) { index--; navigate(); } }),
    forward() { if (index + 1 < entries.length) { index++; navigate(); } },
  };
  vi.stubGlobal("window", { location, history });
  return { location, history, entries };
}

afterEach(() => vi.unstubAllGlobals());

describe("archive detail history", () => {
  it.each(["logo", "website"] as const)("Back closes %s details within the archive and Forward reopens them", (key) => {
    const archive = key === "logo" ? "/logos" : "/websites";
    const { history, location, entries } = browserAt(`${archive}?view=popular`);
    openArchiveDetail({ key, value: "first" });
    openArchiveDetail({ key, value: "next" });
    expect(entries).toHaveLength(2);
    expect(location.search).toBe(`?view=popular&${key}=next`);
    history.back();
    expect(location.pathname + location.search).toBe(`${archive}?view=popular`);
    history.forward();
    expect(location.search).toBe(`?view=popular&${key}=next`);
    closeArchiveDetail();
    expect(location.pathname + location.search).toBe(`${archive}?view=popular`);
    openArchiveDetail({ key, value: "another" });
    expect(entries).toHaveLength(2);
    expect(location.search).toContain(`${key}=another`);
  });

  it("closes a directly loaded detail without sending the visitor off the archive", () => {
    const { history, location, entries } = browserAt("/websites?view=popular&website=shared");
    openArchiveDetail({ key: "website", value: "next" });
    closeArchiveDetail();
    expect(history.back).not.toHaveBeenCalled();
    expect(entries).toHaveLength(1);
    expect(location.pathname + location.search).toBe("/websites?view=popular");
  });
});
