import type { SubmissionResult } from "@/features/submissions/types";

export async function runOptimisticWithdrawal({
  hide,
  id,
  restore,
  withdraw,
}: {
  hide: (id: string) => void;
  id: string;
  restore: (id: string) => void;
  withdraw: (id: string) => Promise<SubmissionResult<null>>;
}): Promise<SubmissionResult<null>> {
  hide(id);
  try {
    const result = await withdraw(id);
    if (!result.ok) restore(id);
    return result;
  } catch {
    restore(id);
    return {
      ok: false,
      code: "unavailable",
      message: "The submission could not be withdrawn. Try again.",
    };
  }
}
