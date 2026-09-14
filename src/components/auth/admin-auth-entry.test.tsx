import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const { renderSignIn } = vi.hoisted(() => ({ renderSignIn: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@clerk/nextjs", () => ({
  SignIn: (props: ComponentProps<"div">) => renderSignIn(props),
}));

import { AdminAuthEntry } from "./admin-auth-entry";

describe("AdminAuthEntry", () => {
  it("keeps the admin sign-in flow isolated under /admin", () => {
    renderSignIn.mockReturnValue(<div data-admin-sign-in />);

    const html = renderToStaticMarkup(<AdminAuthEntry />);

    expect(html).toContain("data-admin-sign-in");
    expect(renderSignIn).toHaveBeenCalledWith(
      expect.objectContaining({
        forceRedirectUrl: "/admin/posts",
        routing: "hash",
        transferable: false,
        withSignUp: false,
      }),
    );
  });
});
