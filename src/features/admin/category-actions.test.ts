import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), transaction: vi.fn(), updateTag: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/auth/require-admin", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/db/write-client", () => ({ withWriteTransaction: mocks.transaction }));
vi.mock("@/data/categories-repository", () => ({ DESIGN_CATEGORIES_CACHE_TAG: "design-categories" }));
vi.mock("next/cache", () => ({ updateTag: mocks.updateTag, revalidatePath: mocks.revalidatePath }));
import { createCategoryAction } from "./category-actions";
import { adminAuditLogs, designCategories } from "@/db/schema";

describe("admin category creation", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.admin.mockResolvedValue({ userId: "admin" }); });

  it("requires admin access before starting a mutation", async () => {
    mocks.admin.mockRejectedValueOnce(new Error("Unauthorized"));
    await expect(createCategoryAction("Typography")).rejects.toThrow("Unauthorized");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each(["", "  ", "a".repeat(61), "All", "LOGOS", "Websites", "app-icons", "in-review"])("rejects invalid or reserved name %j", async (name) => {
    expect(await createCategoryAction(name)).toMatchObject({ status: "error" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("normalizes a reusable category and audits it in the same transaction", async () => {
    const returning = vi.fn().mockResolvedValue([{ name: "Type Design" }]);
    const values = vi.fn().mockReturnValue({ onConflictDoNothing: () => ({ returning }) });
    const insert = vi.fn().mockReturnValue({ values });
    mocks.transaction.mockImplementation((work) => work({ insert }));
    expect(await createCategoryAction("  Type   Design  ")).toEqual({ status: "success", name: "Type Design" });
    expect(insert).toHaveBeenNthCalledWith(1, designCategories);
    expect(values).toHaveBeenNthCalledWith(1, { name: "Type Design" });
    expect(insert).toHaveBeenNthCalledWith(2, adminAuditLogs);
    expect(values).toHaveBeenNthCalledWith(2, expect.objectContaining({ actorId: "admin", details: { name: "Type Design" } }));
    expect(mocks.updateTag).toHaveBeenCalledWith("design-categories");
  });

  it("reports a duplicate without auditing it or invalidating caches", async () => {
    const values = vi.fn().mockReturnValue({ onConflictDoNothing: () => ({ returning: async () => [] }) });
    const insert = vi.fn().mockReturnValue({ values });
    mocks.transaction.mockImplementation((work) => work({ insert }));
    expect(await createCategoryAction("branding")).toEqual({ status: "error", message: "A category with that name already exists." });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(mocks.updateTag).not.toHaveBeenCalled();
  });

  it("reports a failed transaction without claiming success", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.transaction.mockRejectedValueOnce(new Error("unavailable"));
    expect(await createCategoryAction("Typography")).toMatchObject({ status: "error" });
    expect(mocks.updateTag).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
