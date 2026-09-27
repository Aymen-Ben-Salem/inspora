import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CreatorPicker, filterCreators } from "./creator-picker";

const creators = [
  { id: "1", name: "Alice Studio", username: "alice", avatarUrl: "/avatar.png" },
  { id: "2", name: "Bob Design", username: "bob", legacyHandle: "@oldbob", avatarUrl: "/avatar.png" },
];

describe("creator picker", () => {
  it("searches names, usernames and legacy handles without case or surrounding-space sensitivity", () => {
    expect(filterCreators(creators, "  STUDIO  ")).toEqual([creators[0]]);
    expect(filterCreators(creators, "@BOB")).toEqual([creators[1]]);
    expect(filterCreators(creators, "oldbob")).toEqual([creators[1]]);
    expect(filterCreators(creators, "missing")).toEqual([]);
    expect(filterCreators(creators, "")).toEqual(creators);
  });
  it("shows the selected identity and a non-submitting dropdown trigger", () => {
    const markup = renderToStaticMarkup(<CreatorPicker creators={creators} selectedId="2" onSelect={() => {}} />);
    expect(markup).toContain("Bob Design (@bob)");
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-expanded="false"');
  });
});
