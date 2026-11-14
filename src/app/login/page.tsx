"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Eye, EyeOff, Wallet, X } from "lucide-react";
import BrandMark from "@/components/BrandMark";
import Notice from "@/components/ui/Notice";
import RouteTrace from "@/components/ui/RouteTrace";
import GlobeNetwork from "@/components/ui/GlobeNetwork";
import TurnstileWidget from "@/components/TurnstileWidget";
import { getPasswordStrength, MIN_PASSWORD_SCORE } from "@/lib/password-strength";
import { useWallet } from "@/lib/wallet-context";
import { useDemoMode } from "@/lib/demo-client";

function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  minLength,
  invalid,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete: string;
  minLength?: number;
  invalid?: boolean;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label className="rx-label" htmlFor={id}>{label}</label>
      <div className="rx-field-icon">
        <input
          id={id}
          className="rx-input"
          type={shown ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={minLength}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={invalid}
        />
        <button type="button" className="rx-iconbtn" onClick={() => setShown(!shown)} aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>
          {shown ? <EyeOff size={17} /> : <Eye size={17} />}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const { address, openModal } = useWallet();
  const startedHere = useRef(false);
  const [isRegister, setIsRegister] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const { isDemo } = useDemoMode();

  const strength = getPasswordStrength(password);
  const passwordsMatch = password === confirmPassword;
  const confirmTouched = confirmPassword.length > 0;

  // Only follow a wallet sign-in that was started from this page.
  useEffect(() => {
    if (address && startedHere.current) router.push("/dashboard");
  }, [address, router]);

  function handleWalletLogin() {
    startedHere.current = true;
    openModal();
  }

  function switchMode() {
    setIsRegister(!isRegister);
    setError("");
    setTurnstileToken("");
    setPassword("");
    setConfirmPassword("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (isRegister && !passwordsMatch) return setError("The passwords don't match.");
    if (isRegister && strength.score < MIN_PASSWORD_SCORE) return setError("That password is too weak. Meet at least three of the checks below.");
    if (!turnstileToken) return setError("Complete the verification challenge first.");

    setLoading(true);
    try {
      const res = await fetch(isRegister ? "/api/auth/register" : "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isRegister
            ? { firstName, lastName, email, password, confirmPassword, turnstileToken }
            : { email, password, turnstileToken }
        ),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "Something went wrong. Try again.");
        setTurnstileToken("");
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Couldn't reach the server. Try again.");
      setTurnstileToken("");
    } finally {
      setLoading(false);
    }
  }

  async function handleDemoLogin() {
    setError("");
    setDemoLoading(true);
    try {
      const res = await fetch("/api/auth/demo-login", { method: "POST" });
      const data = await res.json();
      if (!data.success) {
        setError(data.error || "The demo account isn't available.");
        return;
      }
      router.push("/dashboard");
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setDemoLoading(false);
    }
  }

  return (
    <div className="rx-app">
      <div className="rx-authgrid">
        <main className="flex flex-col px-5 py-8 sm:px-10 lg:px-16">
          <Link href="/" className="rx-brand !px-0 w-fit">
            <BrandMark size={18} />
            RemitX
          </Link>

          <div className="mx-auto flex w-full max-w-[400px] flex-1 flex-col justify-center py-10">
            <h1 className="rx-title">{isRegister ? "Create your account" : "Sign in"}</h1>
            <p className="rx-lede">
              {isRegister ? "It takes a minute. You'll connect a Stellar wallet after." : "Pick up where you left off."}
            </p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate={false}>
              {isRegister && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="rx-label" htmlFor="first-name">First name</label>
                    <input id="first-name" className="rx-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} required autoComplete="given-name" />
                  </div>
                  <div>
                    <label className="rx-label" htmlFor="last-name">Last name</label>
                    <input id="last-name" className="rx-input" value={lastName} onChange={(e) => setLastName(e.target.value)} required autoComplete="family-name" />
                  </div>
                </div>
              )}

              <div>
                <label className="rx-label" htmlFor="email">Email</label>
                <input id="email" className="rx-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" />
              </div>

              <div>
                <PasswordField
                  id="password"
                  label="Password"
                  value={password}
                  onChange={setPassword}
                  placeholder={isRegister ? "At least 8 characters" : "Your password"}
                  autoComplete={isRegister ? "new-password" : "current-password"}
                  minLength={isRegister ? 8 : 1}
                />
                {isRegister && password.length > 0 && (
                  <div className="mt-3" aria-live="polite">
                    <div className="rx-strength" aria-hidden="true">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span key={n} style={n <= strength.score ? { background: strength.score >= MIN_PASSWORD_SCORE ? "var(--color-positive)" : "var(--color-caution)" } : undefined} />
                      ))}
                    </div>
                    <p className="rx-small mt-2">Strength: {strength.label}</p>
                    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                      {strength.checks.map((c) => (
                        <li key={c.label} className={`flex items-center gap-1.5 text-[13px] ${c.passed ? "text-ink-2" : "text-faint"}`}>
                          {c.passed ? <Check size={13} className="text-positive" /> : <X size={13} />}
                          {c.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {isRegister && (
                <div>
                  <PasswordField
                    id="confirm-password"
                    label="Confirm password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Re-enter your password"
                    autoComplete="new-password"
                    minLength={8}
                    invalid={confirmTouched && !passwordsMatch}
                  />
                  <p className="rx-hint" data-tone={confirmTouched ? (passwordsMatch ? "positive" : "danger") : undefined} role="status">
                    {confirmTouched ? (passwordsMatch ? "Passwords match." : "Passwords don't match.") : ""}
                  </p>
                </div>
              )}

              <TurnstileWidget onVerify={setTurnstileToken} onExpire={() => setTurnstileToken("")} />

              {error && <Notice tone="danger">{error}</Notice>}

              <button type="submit" className="rx-btn rx-btn-primary rx-btn-block" disabled={loading || !turnstileToken}>
                {loading ? (isRegister ? "Creating account…" : "Signing in…") : isRegister ? "Create account" : "Sign in"}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3 text-[13px] text-faint" aria-hidden="true">
              <span className="h-px flex-1 bg-line" />
              or
              <span className="h-px flex-1 bg-line" />
            </div>

            <button type="button" className="rx-btn rx-btn-secondary rx-btn-block mb-3" onClick={handleWalletLogin} disabled={demoLoading || loading}>
              <Wallet size={17} aria-hidden="true" /> Continue with a Stellar wallet
            </button>

            <button type="button" className="rx-btn rx-btn-secondary rx-btn-block" onClick={handleDemoLogin} disabled={demoLoading || loading}>
              {demoLoading ? "Opening demo..." : "Try the demo account"}
            </button>
            <p className="rx-small mt-3 text-center">
              {isDemo ? "Demo mode active — millions of users flowing." : "Demo login available in non-production with ENABLE_DEMO_LOGIN=true."}
            </p>

            <p className="mt-8 text-center text-[14.5px] text-muted">
              {isRegister ? "Already have an account?" : "New to RemitX?"}{" "}
              <button type="button" onClick={switchMode} className="rx-link font-medium">
                {isRegister ? "Sign in" : "Create an account"}
              </button>
            </p>
          </div>
        </main>

        <aside className="rx-authside" aria-hidden="true">
          <div>
            <p className="max-w-[22ch] text-balance text-[30px] font-medium leading-[1.14] tracking-[-0.035em]">
              Know what it costs before you send it.
            </p>
          </div>

          <GlobeNetwork />

          <div className="max-w-[420px]">
            <RouteTrace nodes={["You", "Stellar", "Home"]} animateKey="auth" />
            <ul className="mt-6 space-y-3 text-[14px] leading-[20px] text-ink-2">
              <li>Rate, fees and arrival time are shown before you confirm.</li>
              <li>Transfers settle in about five seconds.</li>
              <li>If escrowed funds are never released, you can refund them after expiry.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
