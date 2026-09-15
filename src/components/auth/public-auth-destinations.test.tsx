import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const { renderSignIn, renderSignUp } = vi.hoisted(() => ({
  renderSignIn: vi.fn(),
  renderSignUp: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("../../auth/config", () => ({ isClerkConfigured: () => true }));
vi.mock("@clerk/nextjs", () => ({
  useClerk: () => ({ client: undefined }),
  SignIn: (props: ComponentProps<"div">) => renderSignIn(props),
  SignUp: (props: ComponentProps<"div">) => renderSignUp(props),
}));
vi.mock("@clerk/nextjs/legacy", () => ({ useSignUp: () => ({ signUp: undefined }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/sign-in",
  useRouter: () => ({ back: vi.fn(), replace: vi.fn() }),
}));

import { PublicAuthPage } from "./public-auth-page";

describe("public auth destinations", () => {
  afterEach(() => {
    renderSignIn.mockReset();
    renderSignUp.mockReset();
  });

  it.each(["sign-in" as const, "sign-up" as const])(
    "forces the %s flow back to the public site",
    (flow) => {
      renderSignIn.mockReturnValue(<div />);
      renderSignUp.mockReturnValue(<div />);

      renderToStaticMarkup(<PublicAuthPage flow={flow} />);

      const renderer = flow === "sign-in" ? renderSignIn : renderSignUp;
      expect(renderer).toHaveBeenCalledWith(
        expect.objectContaining({ forceRedirectUrl: "/" }),
      );
    },
  );
});
