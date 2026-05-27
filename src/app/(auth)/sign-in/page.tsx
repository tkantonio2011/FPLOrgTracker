"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  PLATFORM_NAME,
  SIGN_IN_HEADING,
  SIGN_IN_SUBMIT_LABEL,
  SIGN_IN_SENT_MESSAGE,
} from "@/lib/branding/strings";

function SignInForm() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get("error");
  const redirectTo = searchParams.get("redirect");

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    errorParam === "invalid_or_expired"
      ? "That sign-in link was invalid or expired. Request a new one below."
      : null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, redirectTo }),
      });
      if (res.status === 429) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Too many requests — please try again later.");
        return;
      }
      // Always show the same message regardless of whether the email is registered.
      setSubmitted(true);
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#00ff87] mb-4">
          <span className="text-2xl">⚽</span>
        </div>
        <h1 className="text-2xl font-bold text-white">{PLATFORM_NAME}</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-xl px-6 py-7">
        <h2 className="text-lg font-bold text-slate-900 mb-1">{SIGN_IN_HEADING}</h2>
        <p className="text-sm text-slate-500 mb-6">
          We&apos;ll email you a single-use sign-in link. No password needed.
        </p>

        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {submitted ? (
          <div className="px-3 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
            {SIGN_IN_SENT_MESSAGE}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 focus:border-[#37003c] transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-[#37003c] text-white text-sm font-semibold hover:bg-[#4a0052] focus:outline-none focus:ring-2 focus:ring-[#37003c]/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Sending…" : SIGN_IN_SUBMIT_LABEL}
            </button>
          </form>
        )}
      </div>

      {/* 005-public-signup: adjacent link to the self-sign-up surface. */}
      <p className="mt-4 text-center text-sm text-white/80">
        Don&apos;t have a league yet?{" "}
        <Link href="/sign-up" className="text-[#00ff87] font-semibold hover:underline">
          Create one →
        </Link>
      </p>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInForm />
    </Suspense>
  );
}
