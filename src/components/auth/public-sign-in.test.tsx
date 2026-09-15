import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { clerk, pathname, renderSignIn } = vi.hoisted(() => ({
  clerk: { client: { signUp: { id: null as string | null, emailAddress: null as string | null } } },
  pathname: vi.fn(() => "/sign-in"),
  renderSignIn: vi.fn(() => <div data-clerk-sign-in />),
}));
vi.mock("@clerk/nextjs", () => ({ useClerk: () => clerk, SignIn: renderSignIn }));
vi.mock("@clerk/nextjs/legacy", () => ({ useSignUp: () => ({ signUp: clerk.client.signUp }) }));
vi.mock("next/navigation", () => ({ usePathname: pathname, useRouter: () => ({ replace: vi.fn() }) }));
import { PublicSignIn } from "./public-sign-in";

describe("public sign-in handoff", () => {
  afterEach(() => {
    clerk.client.signUp.id = null;
    clerk.client.signUp.emailAddress = null;
    pathname.mockReturnValue("/sign-in");
    renderSignIn.mockClear();
  });

  it("uses clean paths and keeps both public completion destinations public", () => {
    renderToStaticMarkup(<PublicSignIn />);
    expect(renderSignIn).toHaveBeenCalledWith(expect.objectContaining({
      routing: "path", path: "/sign-in", withSignUp: true,
      forceRedirectUrl: "/", signUpForceRedirectUrl: "/",
    }), undefined);
  });

  it("continues a transferred new email instead of displaying the email form again", () => {
    pathname.mockReturnValue("/sign-in/create");
    clerk.client.signUp.emailAddress = "new@example.com";
    const html = renderToStaticMarkup(<PublicSignIn />);
    expect(html).toContain('role="status"');
    expect(html).toContain('id="clerk-captcha"');
    expect(renderSignIn).not.toHaveBeenCalled();
  });

  it.each(["/sign-in/create/verify-email-address", "/sign-in/create/sso-callback", "/sign-in/factor-one"])(
    "leaves %s with Clerk",
    path => {
      pathname.mockReturnValue(path);
      clerk.client.signUp.emailAddress = "new@example.com";
      renderToStaticMarkup(<PublicSignIn />);
      expect(renderSignIn).toHaveBeenCalledOnce();
    },
  );

  it("preserves existing signup attempts, including OAuth transfers", () => {
    pathname.mockReturnValue("/sign-in/create");
    clerk.client.signUp.id = "sua_existing";
    clerk.client.signUp.emailAddress = "existing@example.com";
    renderToStaticMarkup(<PublicSignIn />);
    expect(renderSignIn).toHaveBeenCalledOnce();
  });
});
