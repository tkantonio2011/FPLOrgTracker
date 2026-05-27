"use client";

/**
 * Signed-in "create another league" form. POSTs to /api/leagues. On 201,
 * navigates the browser to the new league's admin shell via the server-
 * supplied `redirectTo`. On 400/409, surfaces the server's inline error.
 *
 * Feature 005-public-signup (US2 — second-league flow without magic-link).
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateAnotherLeagueForm() {
  const router = useRouter();
  const [leagueName, setLeagueName] = useState("");
  const [miniLeagueIdRaw, setMiniLeagueIdRaw] = useState("");
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
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leagueName, miniLeagueId }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { redirectTo?: string };
        error?: string;
      };
      if (res.status === 201 && body.success && body.data?.redirectTo) {
        router.push(body.data.redirectTo);
        return;
      }
      setError(body.error ?? "Something went wrong. Please try again.");
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
      {error && (
        <div className="px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}
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
          placeholder="The Tuesday Crew"
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
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 px-4 rounded-lg bg-[#37003c] text-white text-sm font-semibold hover:bg-[#4a0052] focus:outline-none focus:ring-2 focus:ring-[#37003c]/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? "Creating…" : "Create league"}
      </button>
    </form>
  );
}
