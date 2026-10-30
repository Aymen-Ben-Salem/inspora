import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { lookupXProfile, lookupXAccountById } from "./x-api";

const request = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", request); vi.stubEnv("X_API_BEARER_TOKEN", "test-token"); request.mockReset(); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("official X profile lookup", () => {
  it("normalizes the lookup URL and preserves the returned username case and numeric ID", async () => {
    request.mockResolvedValue(Response.json({ data: { id: "2115916726055632924", username: "Example" } }));
    expect(await lookupXProfile("https://twitter.com/Example/status/123")).toEqual({ id: "2115916726055632924", username: "Example" });
    expect(request).toHaveBeenCalledWith("https://api.x.com/2/users/by/username/example", expect.objectContaining({ headers: { Authorization: "Bearer test-token" }, redirect: "error", cache: "no-store" }));
  });
  it.each(["https://evil.example/example", "https://x.com@evil.example/example", "https://x.com/i", "http://x.com/example"])("never sends credentials to an invalid input %s", async url => {
    await expect(lookupXProfile(url)).rejects.toThrow(); expect(request).not.toHaveBeenCalled();
  });
  it.each([401, 402, 403, 429, 500])("fails closed on provider status %s", async status => {
    request.mockResolvedValue(new Response("private provider details", { status }));
    await expect(lookupXProfile("https://x.com/example")).rejects.toThrow("temporarily unavailable");
  });
  it("distinguishes a missing profile", async () => {
    request.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(lookupXProfile("https://x.com/example")).rejects.toMatchObject({ code: "not_found" });
  });
  it("recognizes a missing profile returned as HTTP 200 with resource errors", async () => {
    request.mockResolvedValue(Response.json({ errors: [{ type: "https://api.x.com/2/problems/resource-not-found" }] }));
    await expect(lookupXProfile("https://x.com/example")).rejects.toMatchObject({ code: "not_found" });
  });
  it.each([{ id: 123, username: "example" }, { id: "123", username: "another" }, { id: "", username: "example" }, null])("rejects malformed or mismatched identity evidence %#", async data => {
    request.mockResolvedValue(Response.json({ data }));
    await expect(lookupXProfile("https://x.com/example")).rejects.toThrow("could not confirm");
  });
  it("does not expose transport errors or tokens", async () => {
    request.mockRejectedValue(new Error("Authorization: Bearer test-token"));
    await expect(lookupXProfile("https://x.com/example")).rejects.toThrow("temporarily unavailable");
  });
  it("fails closed without a token", async () => {
    vi.stubEnv("X_API_BEARER_TOKEN", "");
    await expect(lookupXProfile("https://x.com/example")).rejects.toThrow("temporarily unavailable");
    expect(request).not.toHaveBeenCalled();
  });

  it("retrieves photo metadata in the same admin identity lookup", async () => {
    request.mockResolvedValue(Response.json({ data: { id: "123", username: "Example", profile_image_url: "https://pbs.twimg.com/profile_images/123/a_normal.jpg" } }));
    expect(await lookupXProfile("https://x.com/example", { includeAvatar: true })).toMatchObject({ id: "123", profileImageUrl: "https://pbs.twimg.com/profile_images/123/a_normal.jpg" });
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0]).toContain("?user.fields=profile_image_url");
  });

  it("checks the stable authenticated account ID before accepting its photo", async () => {
    request.mockResolvedValue(Response.json({ data: { id: "456", username: "renamed", profile_image_url: "https://pbs.twimg.com/profile_images/456/a.jpg" } }));
    await expect(lookupXAccountById("123")).rejects.toThrow("could not confirm");
    request.mockResolvedValue(Response.json({ data: { id: "123", username: "renamed", profile_image_url: "https://evil.example/a.jpg" } }));
    expect(await lookupXAccountById("123")).toEqual({ id: "123", username: "renamed" });
  });
});
