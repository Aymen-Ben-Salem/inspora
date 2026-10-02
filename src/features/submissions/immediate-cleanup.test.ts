import { expect, it, vi } from "vitest";
import { createImmediateCleanup } from "./immediate-cleanup";

function fixture() {
  const job = { id: "chosen", lease: 123 };
  return { job, claim: vi.fn().mockResolvedValue(job), exists: vi.fn().mockResolvedValue(false), process: vi.fn(), complete: vi.fn(), fail: vi.fn() };
}

it("processes only the selected claim and acknowledges that exact lease", async () => {
  const deps = fixture();
  expect(await createImmediateCleanup(deps)("chosen")).toBe("completed");
  expect(deps.claim).toHaveBeenCalledWith("chosen");
  expect(deps.process).toHaveBeenCalledExactlyOnceWith(deps.job);
  expect(deps.complete).toHaveBeenCalledExactlyOnceWith(deps.job);
});
it("keeps failure durable and supports a later manual retry", async () => {
  const deps = fixture();
  deps.process.mockRejectedValueOnce(new Error("secret provider payload"));
  const run = createImmediateCleanup(deps);
  expect(await run("chosen")).toBe("pending");
  expect(deps.fail).toHaveBeenCalledExactlyOnceWith(deps.job);
  expect(deps.complete).not.toHaveBeenCalled();
  expect(await run("chosen")).toBe("completed");
});
it("does not process another request's lease or claim success while it remains", async () => {
  const deps = fixture(); deps.claim.mockResolvedValue(null); deps.exists.mockResolvedValue(true);
  expect(await createImmediateCleanup(deps)("chosen")).toBe("pending");
  expect(deps.process).not.toHaveBeenCalled();
});
it("accepts an already completed request and fails closed on database errors", async () => {
  const deps = fixture(); deps.claim.mockResolvedValue(null);
  const run = createImmediateCleanup(deps);
  expect(await run("chosen")).toBe("completed");
  deps.claim.mockRejectedValue(new Error("database unavailable"));
  expect(await run("chosen")).toBe("pending");
});
