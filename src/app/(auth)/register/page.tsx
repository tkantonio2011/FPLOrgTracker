"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();

  const [managerId,       setManagerId]       = useState("");
  const [email,           setEmail]           = useState("");
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error,           setError]           = useState<string | null>(null);
  const [loading,         setLoading]         = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          managerId:       parseInt(managerId, 10),
          email:           email.trim() || null,
          password,
          confirmPassword,
        }),
      });
      const json = await res.json() as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Registration failed");
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Logo / brand */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#00ff87] mb-4">
          <span className="text-2xl">⚽</span>
        </div>
        <h1 className="text-2xl font-bold text-white">FPL Org Tracker</h1>
        <p className="text-sm text-white/50 mt-1">EnergyOne Fantasy League</p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl shadow-xl px-6 py-7">
        <h2 className="text-lg font-bold text-slate-900 mb-1">Create account</h2>
        <p className="text-sm text-slate-500 mb-6">
          You must be in the org&apos;s mini-league to register
        </p>

        {error && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="managerId" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              FPL Manager ID
            </label>
            <input
              id="managerId"
              type="number"
              inputMode="numeric"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              placeholder="e.g. 1234567"
              required
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 focus:border-[#37003c] transition-colors"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Find your ID at fantasy.premierleague.com → Points → the number in the URL
            </p>
          </div>

          <div>
            <label htmlFor="email" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Email <span className="normal-case font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 focus:border-[#37003c] transition-colors"
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Used to receive the weekly GW digest email. You can update this later.
            </p>
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
              minLength={8}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 focus:border-[#37003c] transition-colors"
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-xs font-semibold text-slate-600 mb-1.5 uppercase tracking-wide">
              Confirm Password
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#37003c]/30 focus:border-[#37003c] transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-[#37003c] text-white text-sm font-semibold hover:bg-[#4a0052] focus:outline-none focus:ring-2 focus:ring-[#37003c]/50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-[#37003c] hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
