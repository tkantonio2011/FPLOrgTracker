"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface IssueResponse {
  success: boolean;
  data?: { invitationId: string; expiresAt: string };
  error?: string;
}

/**
 * Invite a member by email. Posts to `POST /api/invitations`. Distinct from
 * `AddMemberDialog` (which uses `POST /api/leagues/{id}/members` and pre-
 * creates the membership): the invitation flow defers membership creation
 * until the invitee accepts and supplies their own `managerId`.
 */
export function InviteMemberDialog({
  leagueId,
  onClose,
  onIssued,
}: {
  leagueId: string;
  onClose: () => void;
  onIssued: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [managerId, setManagerId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        leagueId,
        email: email.trim(),
        role,
      };
      if (managerId && !isNaN(Number(managerId))) body.managerId = Number(managerId);
      if (displayName.trim()) body.displayName = displayName.trim();
      const res = await fetch("/api/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as IssueResponse;
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Invite failed");
      }
      return json.data;
    },
    onSuccess: onIssued,
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    mutation.mutate();
  }

  const inputCls =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-[#37003c] focus:outline-none focus:ring-1 focus:ring-[#37003c]";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <Card className="max-w-md w-full">
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <header>
            <h2 className="text-lg font-semibold text-slate-900">Invite by email</h2>
            <p className="text-xs text-slate-500 mt-1">
              Sends a sign-in link. The invitee fills in their own manager ID on accept (or you
              can pre-supply it below).
            </p>
          </header>

          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">Role</span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "member" | "admin")}
              className={inputCls}
            >
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">
              FPL Manager ID <span className="text-slate-400">(optional, pre-fills on accept)</span>
            </span>
            <input
              type="number"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              min={1}
              className={inputCls}
            />
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

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={mutation.isPending}>
              {mutation.isPending ? "Sending…" : "Send invitation"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
