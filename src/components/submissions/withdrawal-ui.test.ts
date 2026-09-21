import { describe, expect, it, vi } from "vitest";

import { runOptimisticWithdrawal } from "./withdrawal-ui";

describe("optimistic withdrawal UI", () => {
  it("hides the submission before the server action settles and commits on success", async () => {
    let resolveWithdrawal!: (result: { ok: true; value: null }) => void;
    const withdraw = vi.fn(() => new Promise<{ ok: true; value: null }>((resolve) => {
      resolveWithdrawal = resolve;
    }));
    const hide = vi.fn();
    const restore = vi.fn();

    const pending = runOptimisticWithdrawal({ id: "submission-1", withdraw, hide, restore });

    expect(hide).toHaveBeenCalledWith("submission-1");
    expect(restore).not.toHaveBeenCalled();

    resolveWithdrawal({ ok: true, value: null });
    await expect(pending).resolves.toEqual({ ok: true, value: null });
    expect(restore).not.toHaveBeenCalled();
  });

  it("restores the submission when the server action rejects the withdrawal", async () => {
    const failure = { ok: false as const, code: "unavailable", message: "Try again." };
    const hide = vi.fn();
    const restore = vi.fn();

    await expect(runOptimisticWithdrawal({
      id: "submission-1",
      withdraw: vi.fn().mockResolvedValue(failure),
      hide,
      restore,
    })).resolves.toEqual(failure);

    expect(hide).toHaveBeenCalledWith("submission-1");
    expect(restore).toHaveBeenCalledWith("submission-1");
  });

  it("restores the submission when the server action transport throws", async () => {
    const hide = vi.fn();
    const restore = vi.fn();

    await expect(runOptimisticWithdrawal({
      id: "submission-1",
      withdraw: vi.fn().mockRejectedValue(new Error("Connection lost")),
      hide,
      restore,
    })).resolves.toEqual({
      ok: false,
      code: "unavailable",
      message: "The submission could not be withdrawn. Try again.",
    });

    expect(hide).toHaveBeenCalledWith("submission-1");
    expect(restore).toHaveBeenCalledWith("submission-1");
  });
});
