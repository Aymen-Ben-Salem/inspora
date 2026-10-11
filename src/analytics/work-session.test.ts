import { expect, it, vi } from "vitest";
it("keeps a memory-only tab session until thirty minutes idle and resets on reload", async () => {
  vi.resetModules();
  const { getWorkSessionKey } = await import("./work-session");
  const first = getWorkSessionKey(1000);
  expect(getWorkSessionKey(2000)).toBe(first);
  expect(getWorkSessionKey(1802000)).not.toBe(first);
  vi.resetModules();
  expect((await import("./work-session")).getWorkSessionKey(1802000)).not.toBe(
    first,
  );
});
