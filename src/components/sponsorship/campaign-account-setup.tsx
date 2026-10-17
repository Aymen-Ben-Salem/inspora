import { sponsorButton } from "./button-styles";

export function CampaignAccountSetup({ id, ready, signedIn, onContinue }: {
  id: string;
  ready: boolean;
  signedIn: boolean;
  onContinue: () => void;
}) {
  if (ready) return (
    <div id={id} role="status" className="flex items-center gap-2 border-b border-[#e6e6e6] pb-5 text-sm text-[#767676]">
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="size-4 text-[#262626]">
        <path d="m4 10 4 4 8-8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Account ready
    </div>
  );
  return (
    <section id={id} aria-labelledby={`${id}-title`} tabIndex={-1} className="focus-ring scroll-mt-28 space-y-4 rounded-lg border border-[#e6e6e6] bg-[#fafafa] p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 id={`${id}-title`} className="text-lg font-medium">
          {signedIn ? "Finish setting up your sponsor account" : "Set up your sponsor account"}
        </h2>
        <span className="rounded border border-[#e6e6e6] bg-white px-2 py-0.5 text-xs text-[#767676]">Required</span>
      </div>
      <p className="text-sm leading-6 text-[#767676]">
        {signedIn
          ? "Complete account setup to upload your creative, save your campaign and continue to checkout."
          : "Sign in or create an account to upload your creative, save your campaign and continue to checkout."}
      </p>
      <button type="button" onClick={onContinue} className={`${sponsorButton.primary} gap-2`}>
        {signedIn ? "Continue setup" : "Continue with account setup"}
        <span aria-hidden="true">→</span>
      </button>
      <p className="text-xs leading-5 text-[#767676]">
        {signedIn ? "Setup includes email verification and two-step verification with an authenticator app." : "You’ll verify your email and set up two-step verification with an authenticator app."}
        {" "}No payment is required at this step.
      </p>
    </section>
  );
}

export function AccountSetupHint({ id, setupId }: { id: string; setupId: string }) {
  return (
    <p id={id} className="mt-3 text-xs leading-5 text-[#767676]">
      <a href={`#${setupId}`} className="focus-ring cursor-pointer underline underline-offset-4">Complete account setup above</a> to use this.
    </p>
  );
}
