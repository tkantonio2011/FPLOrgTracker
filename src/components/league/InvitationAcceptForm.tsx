"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

interface AcceptResponse {
  success: boolean;
  data?: { leagueSlug: string; redirectTo: string };
  error?: string;
}

export function InvitationAcceptForm({
  token,
  inviteeEmail,
  presuppliedManagerId,
  presuppliedDisplayName,
}: {
  token: string;
  inviteeEmail: string;
  presuppliedManagerId: number | null;
  presuppliedDisplayName: string | null;
}) {
  const router = useRouter();
  const [managerId, setManagerId] = useState(
    presuppliedManagerId !== null ? String(presuppliedManagerId) : "",
  );
  const [displayName, setDisplayName] = useState(presuppliedDisplayName ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!managerId || isNaN(Number(managerId))) {
      setError("Please enter your FPL Manager ID.");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { managerId: Number(managerId) };
      if (displayName.trim()) body.displayName = displayName.trim();
      const res = await fetch(`/api/invitations/${encodeURIComponent(token)}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as AcceptResponse;
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Accept failed");
      }
      router.push(json.data.redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accept failed");
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-[#37003c] focus:outline-none focus:ring-1 focus:ring-[#37003c]";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <span className="block text-xs font-medium text-slate-700 mb-1">Email</span>
        <input
          type="email"
          value={inviteeEmail}
          readOnly
          className={`${inputCls} bg-slate-50 cursor-not-allowed`}
        />
      </div>

      <label className="block">
        <span className="block text-xs font-medium text-slate-700 mb-1">FPL Manager ID</span>
        <input
          type="number"
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
          required
          min={1}
          readOnly={presuppliedManagerId !== null}
          className={`${inputCls} ${presuppliedManagerId !== null ? "bg-slate-50 cursor-not-allowed" : ""}`}
        />
        {presuppliedManagerId === null && (
          <span className="block text-xs text-slate-400 mt-1">
            The numeric ID from your FPL profile URL (e.g. fantasy.premierleague.com/entry/12345/…).
          </span>
        )}
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-slate-700 mb-1">
          Display name <span className="text-slate-400">(optional)</span>
        </span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={80}
          className={inputCls}
        />
      </label>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded">
          {error}
        </div>
      )}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting ? "Joining…" : "Accept invitation"}
      </Button>
    </form>
  );
}
