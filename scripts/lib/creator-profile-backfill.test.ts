import { describe, expect, it } from "vitest";
import { planCreatorProfileBackfill, type BackfillCreator } from "./creator-profile-backfill";

const creator = (id: string, values: Partial<BackfillCreator> = {}): BackfillCreator => ({
  id, name: "Ada Lovelace", handle: null, username: null, ownerUserId: null,
  xProviderId: null, recordOrigin: "mirrored", ...values,
});

describe("legacy creator public profile initialization", () => {
  it("assigns a route to a legacy creator using the existing handle rules", () => {
    expect(planCreatorProfileBackfill([creator("a", { handle: "@Ada" })], [])).toEqual([
      { creatorId: "a", username: "ada", updateUsername: true, insertAlias: true },
    ]);
  });
  it("reserves existing usernames and historical aliases, with deterministic collisions", () => {
    const rows = [creator("b"), creator("a"), creator("c", { username: "ada_lovelace_2" })];
    const aliases = [{ creatorId: "other", username: "ada_lovelace", isCurrent: false }];
    const plan = planCreatorProfileBackfill(rows, aliases);
    expect(plan.find((row) => row.creatorId === "a")?.username).toBe("ada_lovelace_3");
    expect(plan.find((row) => row.creatorId === "b")?.username).toBe("ada_lovelace_4");
    expect(planCreatorProfileBackfill([...rows].reverse(), aliases)).toEqual(plan);
  });
  it("repairs a missing alias while keeping the existing username", () => {
    expect(planCreatorProfileBackfill([creator("a", { username: "established" })], [])).toEqual([
      { creatorId: "a", username: "established", updateUsername: false, insertAlias: true },
    ]);
  });
  it("uses an existing current alias when only the creator username is missing", () => {
    expect(planCreatorProfileBackfill([creator("a")], [
      { creatorId: "a", username: "original", isCurrent: true },
    ])).toEqual([{ creatorId: "a", username: "original", updateUsername: true, insertAlias: false }]);
  });
  it("skips claimed, user-origin and hidden Development records", () => {
    expect(planCreatorProfileBackfill([
      creator("a", { ownerUserId: "test-owner" }),
      creator("b", { xProviderId: "test-provider" }),
      creator("c", { recordOrigin: "user" }),
      creator("d", { handle: "dev-fixture" }),
      creator("e", { recordOrigin: "development" }),
    ], [])).toEqual([]);
  });
  it("uses valid fallback names for reserved and unusable names", () => {
    expect(planCreatorProfileBackfill([
      creator("a", { name: "Admin" }), creator("b", { name: "!!!" }),
    ], []).map((row) => row.username)).toEqual(["creator", "creator_2"]);
  });
  it("refuses to take another creator's alias or silently change an established route", () => {
    expect(() => planCreatorProfileBackfill([creator("a", { username: "taken" })], [
      { creatorId: "b", username: "taken", isCurrent: false },
    ])).toThrow(/conflict/i);
    expect(() => planCreatorProfileBackfill([creator("a", { username: "original" })], [
      { creatorId: "a", username: "different", isCurrent: true },
    ])).toThrow(/conflict/i);
  });
  it("leaves historical redirects untouched and is idempotent", () => {
    const rows = [creator("a")];
    const aliases = [{ creatorId: "a", username: "previous", isCurrent: false }];
    const plan = planCreatorProfileBackfill(rows, aliases);
    const after = rows.map((row) => ({ ...row, username: plan[0].username }));
    expect(planCreatorProfileBackfill(after, [...aliases, {
      creatorId: "a", username: plan[0].username, isCurrent: true,
    }])).toEqual([]);
    expect(rows[0].username).toBeNull();
    expect(aliases[0].isCurrent).toBe(false);
  });
});
