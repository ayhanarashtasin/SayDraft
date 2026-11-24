"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { CuteMicIcon, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/api-client";
import { PASSWORD_MAX, PASSWORD_MIN, safeNext } from "@/lib/auth-shared";

interface AuthFormProps {
  mode: "login" | "signup";
  /** Where to go after signing in (already checked to be a path on this site). */
  next: string;
}

export function AuthForm({ mode, next }: AuthFormProps) {
  const signup = mode === "signup";
  const id = useId();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const other = signup ? "/login" : "/signup";
  const otherHref = next === "/" ? other : `${other}?next=${encodeURIComponent(next)}`;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api(signup ? "/api/auth/signup" : "/api/auth/login", {
        json: signup ? { name, email, password } : { email, password },
      });
      // A full page load, so every request from here on carries the new session cookie.
      window.location.assign(safeNext(next));
    } catch (failure) {
      setError(errorMessage(failure));
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[var(--canvas)] px-5 py-10">
      <div className="w-full max-w-[26rem]">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--cta-bg)] text-[var(--cta-ink)] shadow-md">
            <CuteMicIcon className="h-10 w-10" />
          </span>
          <p className="mt-3 text-xl font-bold tracking-tight text-[var(--ink)]">Saydraft</p>
        </div>

        <form onSubmit={submit} noValidate={false} className="rounded-[2rem] border border-[var(--border)] bg-[var(--surface-panel)] p-6 shadow-xl sm:p-8">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--ink)]">{signup ? "Create your account" : "Log in"}</h1>
          <p className="mt-1 text-sm text-[var(--ink-muted)]">
            {signup ? "Your notes, recordings and settings stay private to your account." : "Welcome back. Log in to see your notes."}
          </p>

          <div className="mt-6 flex flex-col gap-4">
            {signup && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`${id}-name`} className="text-sm font-medium text-[var(--ink-subtle)]">
                  Name <span className="font-normal text-[var(--ink-muted)]">(optional)</span>
                </label>
                <input
                  id={`${id}-name`}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoComplete="name"
                  maxLength={60}
                  className="field"
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-email`} className="text-sm font-medium text-[var(--ink-subtle)]">
                Email
              </label>
              <input
                id={`${id}-email`}
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                inputMode="email"
                required
                autoFocus
                className="field"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-password`} className="text-sm font-medium text-[var(--ink-subtle)]">
                Password
              </label>
              <div className="relative">
                <input
                  id={`${id}-password`}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={signup ? "new-password" : "current-password"}
                  minLength={signup ? PASSWORD_MIN : undefined}
                  maxLength={PASSWORD_MAX}
                  required
                  aria-describedby={signup ? `${id}-password-hint` : undefined}
                  className="field pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="icon-btn absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-[var(--ink-muted)]"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {signup && (
                <p id={`${id}-password-hint`} className="text-xs text-[var(--ink-muted)]">
                  At least {PASSWORD_MIN} characters.
                </p>
              )}
            </div>
          </div>

          <p role="alert" aria-live="polite" className={error ? "mt-4 text-sm text-[var(--danger)]" : "sr-only"}>
            {error ?? ""}
          </p>

          <button type="submit" disabled={busy} className="btn btn-primary mt-5 w-full">
            {busy && <Spinner className="h-4 w-4" />} {signup ? (busy ? "Creating account…" : "Create account") : busy ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-[var(--ink-muted)]">
          {signup ? "Already have an account?" : "New here?"}{" "}
          <Link href={otherHref} className="font-semibold text-[var(--brand)] hover:underline">
            {signup ? "Log in" : "Create an account"}
          </Link>
        </p>
      </div>
    </main>
  );
}
