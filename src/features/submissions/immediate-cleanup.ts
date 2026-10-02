export type CleanupAttempt = "completed" | "pending";

// Persistence and exclusive claiming belong to the caller. A failed attempt
// leaves the durable request available to an admin, without exposing providers.
export function createImmediateCleanup<Job>(dependencies: {
  claim(id: string): Promise<Job | null>;
  exists(id: string): Promise<boolean>;
  process(job: Job): Promise<void>;
  complete(job: Job): Promise<void>;
  fail(job: Job): Promise<void>;
}) {
  return async (id: string): Promise<CleanupAttempt> => {
    try {
      const job = await dependencies.claim(id);
      if (!job) return await dependencies.exists(id) ? "pending" : "completed";
      try {
        await dependencies.process(job);
        await dependencies.complete(job);
        return await dependencies.exists(id) ? "pending" : "completed";
      } catch {
        await dependencies.fail(job);
        return "pending";
      }
    } catch {
      // A connection failure or interrupted request must never report deletion.
      return "pending";
    }
  };
}
