"use client";

import {
  SignOutButton,
  useAuth,
  useUser,
  useSession,
  useReverification,
} from "@clerk/nextjs";
import { isReverificationCancelledError } from "@clerk/nextjs/errors";
import { useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { SponsorSecurityState } from "@/features/sponsorship/security-state";
import { SponsorLoading } from "./sponsor-loading";

const buttonClass =
  "focus-ring min-h-11 cursor-pointer rounded-md bg-[#262626] px-5 py-3 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50";
const linkClass =
  "focus-ring cursor-pointer text-sm text-[#767676] underline underline-offset-4 hover:text-[#262626] disabled:cursor-not-allowed";
type Phase =
  | "checking"
  | "setup"
  | "enroll"
  | "recovery"
  | "verify"
  | "ready"
  | "email";

async function securityState(
  signal?: AbortSignal,
): Promise<SponsorSecurityState> {
  const response = await fetch("/api/sponsorship/security", {
    cache: "no-store",
    signal,
  });
  const result = await response.json();
  if (
    !response.ok ||
    ![
      "signed_out",
      "email_required",
      "setup_required",
      "verification_required",
      "ready",
    ].includes(result.state)
  )
    throw new Error("Account security could not be checked.");
  return result.state;
}

export function SponsorSecurity({
  authenticationEnabled = true,
}: {
  authenticationEnabled?: boolean;
}) {
  return authenticationEnabled ? (
    <AuthenticatedSecurity />
  ) : (
    <main className="p-8">Sponsor verification is currently unavailable.</main>
  );
}
function AuthenticatedSecurity() {
  const { isLoaded, isSignedIn, userId, sessionId } = useAuth();
  if (!isLoaded) return <SponsorLoading label="Loading account security…" />;
  if (!isSignedIn || !userId)
    return (
      <main className="mx-auto max-w-[560px] px-4 py-16">
        <p>Sign in to secure your sponsor account.</p>
        <a
          href="/api/sponsorship/intent"
          className={`${linkClass} mt-4 inline-block`}
        >
          Sign in
        </a>
      </main>
    );
  return <SecuritySetup key={`${userId}:${sessionId}`} />;
}

function SecuritySetup() {
  const { user } = useUser();
  const { session } = useSession();
  const [phase, setPhase] = useState<Phase>("checking");
  const [totp, setTotp] = useState<{ uri: string; secret: string }>();
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [codes, setCodes] = useState<string[]>([]);
  const [savedCodes, setSavedCodes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef(false);
  const createTotp = useReverification(async () => user?.createTOTP());
  const createBackup = useReverification(async () => user?.createBackupCode());

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    void securityState(controller.signal)
      .then((state) => {
        if (!active.current || controller.signal.aborted) return;
        setPhase(
          state === "ready"
            ? "ready"
            : state === "setup_required"
              ? "setup"
              : state === "verification_required"
                ? "verify"
                : "email",
        );
      })
      .catch(() => {
        if (active.current && !controller.signal.aborted)
          setError(
            "Account security could not be checked. Refresh to try again.",
          );
      });
    return () => {
      active.current = false;
      controller.abort();
    };
  }, []);

  async function run(message: string, work: () => Promise<void>) {
    if (busy || !user || !session) return;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (failure) {
      if (active.current && !isReverificationCancelledError(failure))
        setError(message);
    } finally {
      if (active.current) setBusy(false);
    }
  }
  async function recoveryCodes() {
    const result = await createBackup();
    if (!active.current) return;
    if (!result?.codes.length) throw new Error("Recovery codes unavailable.");
    setCodes(result.codes);
    setSavedCodes(false);
    setPhase("recovery");
  }
  function downloadRecoveryCodes() {
    const text = [
      "Inspora recovery codes",
      "Keep these codes safe. Each code can be used once.",
      "",
      ...codes,
      "",
    ].join("\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/plain;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "inspora-recovery-codes.txt";
    document.body.appendChild(anchor);
    try {
      anchor.click();
    } finally {
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
  async function continueToSponsor() {
    await session?.getToken({ skipCache: true });
    if (!active.current) return;
    const state = await securityState();
    if (!active.current) return;
    setCode("");
    if (state === "ready") window.location.replace("/api/sponsorship/verify");
    else if (state === "verification_required") setPhase("verify");
    else if (state === "setup_required") {
      setTotp(undefined);
      setPhase("setup");
    } else setPhase("email");
  }
  const startSetup = () =>
    run("Authenticator setup could not start. Try again.", async () => {
      const result = await createTotp();
      if (!active.current) return;
      if (!result?.uri || !result.secret)
        throw new Error("Authenticator setup unavailable.");
      setTotp({ uri: result.uri, secret: result.secret });
      setCode("");
      setPhase("enroll");
    });
  const enroll = () =>
    run(
      "The code or recovery-code setup could not be verified. Check your app and try again.",
      async () => {
        const result = await user!.verifyTOTP({ code });
        if (!active.current) return;
        setTotp(undefined);
        setCode("");
        setPhase("recovery");
        if (result.backupCodes?.length) {
          setCodes(result.backupCodes);
          setSavedCodes(false);
        } else await recoveryCodes();
      },
    );
  const verify = () =>
    run(
      "That code could not be verified. Try a current authenticator code or an unused recovery code.",
      async () => {
        await session!.startVerification({ level: "second_factor" });
        if (!active.current) return;
        await session!.attemptSecondFactorVerification({
          strategy: backup ? "backup_code" : "totp",
          code,
        });
        if (active.current) await continueToSponsor();
      },
    );

  return (
    <main className="mx-auto max-w-[560px] px-4 py-10 text-[#262626] sm:px-8">
      <div className="flex items-center justify-between gap-4">
        <a className={linkClass} href="/sponsor">
          ← Sponsorship
        </a>
        <SignOutButton redirectUrl="/sponsor">
          <button type="button" className={`${linkClass} min-h-11`}>
            Sign out
          </button>
        </SignOutButton>
      </div>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">
        Secure your sponsor account
      </h1>
      <p className="mt-4 text-sm leading-6 text-[#767676]">
        Keep signing in with email or Google. Sponsorship requires a second
        verification from an authenticator app. Your Profile, Saved and Submit
        work remain available.
      </p>
      <section className="mt-8 space-y-5 rounded-md border border-[#e6e6e6] p-5">
        {phase === "checking" ? (
          <p role="status" className="text-sm text-[#767676]">
            Checking account security…
          </p>
        ) : null}
        {phase === "email" ? (
          <p className="text-sm leading-6">
            Sign in again with your verified primary email before setting up
            sponsor access.
          </p>
        ) : null}
        {phase === "setup" ? (
          <>
            <h2 className="font-medium">Add an authenticator app</h2>
            <p className="text-sm leading-6 text-[#767676]">
              Use an authenticator app such as Google Authenticator, Microsoft
              Authenticator or 1Password. You’ll save recovery codes in case you
              lose access to it.
            </p>
            <button
              type="button"
              className={buttonClass}
              disabled={busy || !user || !session}
              onClick={() => void startSetup()}
            >
              Set up authenticator
            </button>
          </>
        ) : null}
        {phase === "enroll" && totp ? (
          <>
            <h2 className="font-medium">Scan with your authenticator app</h2>
            <QRCodeSVG
              value={totp.uri}
              size={180}
              marginSize={2}
              title="Authenticator setup QR code"
            />
            <label className="block text-sm">
              Or enter this setup key
              <input
                readOnly
                autoComplete="off"
                value={totp.secret}
                className="mt-2 w-full rounded-md border border-[#e6e6e6] px-3 py-2 font-mono text-xs"
              />
            </label>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void enroll();
              }}
            >
              <CodeInput code={code} setCode={setCode} disabled={busy} />
              <button
                className={buttonClass}
                disabled={busy || !/^\d{6}$/.test(code)}
              >
                Verify authenticator
              </button>
            </form>
          </>
        ) : null}
        {phase === "recovery" ? (
          <>
            <h2 className="font-medium">Save your recovery codes</h2>
            <p className="text-sm leading-6 text-[#767676]">
              Store these somewhere safe, such as your password manager. Each
              code works once if you lose your authenticator.
            </p>
            {codes.length ? (
              <>
                <ul
                  className="grid gap-2 rounded-md bg-[#fafafa] p-4 font-mono text-sm"
                  aria-label="Recovery codes"
                >
                  {codes.map((value) => (
                    <li key={value}>{value}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={linkClass}
                  disabled={busy}
                  onClick={downloadRecoveryCodes}
                >
                  Download recovery codes (.txt)
                </button>
                <label className="flex cursor-pointer gap-3 text-sm">
                  <input
                    type="checkbox"
                    className="cursor-pointer"
                    checked={savedCodes}
                    onChange={(event) => setSavedCodes(event.target.checked)}
                  />
                  I’ve saved my recovery codes
                </label>
                <button
                  type="button"
                  className={buttonClass}
                  disabled={busy || !savedCodes}
                  onClick={() =>
                    void run(
                      "Verification could not finish. Try again.",
                      continueToSponsor,
                    )
                  }
                >
                  Continue
                </button>
              </>
            ) : (
              <button
                type="button"
                className={buttonClass}
                disabled={busy}
                onClick={() =>
                  void run(
                    "Recovery codes could not be generated. Try again.",
                    recoveryCodes,
                  )
                }
              >
                Generate recovery codes
              </button>
            )}
          </>
        ) : null}
        {phase === "verify" ? (
          <>
            <h2 className="font-medium">Verify this sign-in</h2>
            <p className="text-sm leading-6 text-[#767676]">
              Enter{" "}
              {backup
                ? "one unused recovery code"
                : "the current code from your authenticator app"}{" "}
              to open your sponsorship.
            </p>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                void verify();
              }}
            >
              <CodeInput
                code={code}
                setCode={setCode}
                disabled={busy}
                backup={backup}
              />
              <button
                className={buttonClass}
                disabled={
                  busy || (backup ? !code.trim() : !/^\d{6}$/.test(code))
                }
              >
                Verify and continue
              </button>
            </form>
            {user?.backupCodeEnabled ? (
              <button
                type="button"
                disabled={busy}
                className={linkClass}
                onClick={() => {
                  setBackup(!backup);
                  setCode("");
                  setError("");
                }}
              >
                {backup ? "Use authenticator code" : "Use a recovery code"}
              </button>
            ) : null}
          </>
        ) : null}
        {phase === "ready" ? (
          <>
            <p className="text-sm leading-6">
              Authenticator 2FA is enabled and this sign-in is verified.
            </p>
            <button
              type="button"
              className={buttonClass}
              disabled={busy}
              onClick={() =>
                void run(
                  "Verification could not finish. Try again.",
                  continueToSponsor,
                )
              }
            >
              Continue to sponsorship
            </button>
            <p className="text-xs leading-5 text-[#767676]">
              Generating new recovery codes replaces your previous set.
            </p>
            <button
              type="button"
              className={linkClass}
              disabled={busy}
              onClick={() =>
                void run(
                  "Recovery codes could not be generated. Try again.",
                  recoveryCodes,
                )
              }
            >
              Generate new recovery codes
            </button>
          </>
        ) : null}
        {busy ? (
          <p role="status" className="text-sm text-[#767676]">
            Verifying…
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}
function CodeInput({
  code,
  setCode,
  disabled,
  backup = false,
}: {
  code: string;
  setCode: (value: string) => void;
  disabled: boolean;
  backup?: boolean;
}) {
  return (
    <label className="block text-sm">
      {backup ? "Recovery code" : "Authenticator code"}
      <input
        className="focus-ring mt-2 min-h-11 w-full rounded-md border border-[#e6e6e6] px-3 py-2"
        value={code}
        onChange={(event) => setCode(event.target.value)}
        inputMode={backup ? "text" : "numeric"}
        autoComplete="one-time-code"
        maxLength={backup ? 64 : 6}
        disabled={disabled}
        required
      />
    </label>
  );
}
