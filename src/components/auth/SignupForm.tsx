"use client";

/**
 * Public sign-up form. POSTs to /api/auth/signup. On any non-error 200, shows
 * the same generic "If your details match, you'll receive an email" panel —
 * enumeration-resistance is enforced server-side; the client just reflects
 * whatever the server says.
 *
 * Inline form errors are shown for the two differentiated cases per spec FR-008
 * and FR-021 (duplicate FPL mini-league ID; FPL "no such league"). Anything
 * else falls through to a generic "Something went wrong" message.
 */

import { useState } from "react";
import Link from "next/link";
import { PLATFORM_NAME } from "@/lib/branding/strings";

export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [leagueName, setLeagueName] = useState("");
  const [miniLeagueIdRaw, setMiniLeagueIdRaw] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const miniLeagueId = Number(miniLeagueIdRaw);
    if (!Number.isInteger(miniLeagueId) || miniLeagueId <= 0) {
      setError("FPL mini-league ID must be a positive whole number.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, leagueName, miniLeagueId }),
      });
      if (res.ok) {
        // Generic confirmation — applies to both happy path and any
        // enumeration-resistant no-op (existing email, rate-limited, etc.).
        setSubmitted(true);
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
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
        <h2 className="text-lg font-bold text-slate-900 mb-1">Create your league</h2>
        <p className="text-sm text-slate-500 mb-6">
          We&apos;ll email you a single-use link to confirm and finish setup.
        </p>

        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        {submitted ? (
          <div className="px-3 py-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
            If your details look good, you&apos;ll receive an email shortly. Click the link inside to finish creating your league.
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
            <div>
              <label htmlFor="leagueName" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                League name
              </label>
              <input
                id="leagueName"
                type="text"
                required
                maxLength={80}
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
                placeholder="The Sunday Crew"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 focus:border-[#37003c] transition-colors"
              />
            </div>
            <div>
              <label htmlFor="miniLeagueId" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
                FPL mini-league ID
              </label>
              <input
                id="miniLeagueId"
                type="number"
                inputMode="numeric"
                required
                min={1}
                value={miniLeagueIdRaw}
                onChange={(e) => setMiniLeagueIdRaw(e.target.value)}
                placeholder="123456"
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 focus:border-[#37003c] transition-colors"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Find this in your league&apos;s URL on{" "}
                <a
                  href="https://fantasy.premierleague.com"
                  target="_blank"
                  rel="noreferrer"
                  className="underline hover:text-slate-700"
                >
                  fantasy.premierleague.com
                </a>
                .
              </p>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-lg bg-[#37003c] text-white text-sm font-semibold hover:bg-[#4a0052] focus:outline-none focus:ring-2 focus:ring-[#37003c]/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Creating…" : "Create my league"}
            </button>
          </form>
        )}
      </div>

      <p className="mt-4 text-center text-sm text-white/80">
        Already have a league?{" "}
        <Link href="/sign-in" className="text-[#00ff87] font-semibold hover:underline">
          Sign in →
        </Link>
      </p>
    </div>
  );
}
