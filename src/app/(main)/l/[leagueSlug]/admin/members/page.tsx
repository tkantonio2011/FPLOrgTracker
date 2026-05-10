"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useLeague } from "@/components/league/LeagueProvider";
import { InviteMemberDialog } from "@/components/league/InviteMemberDialog";

interface Member {
  id: string;
  managerId: number;
  displayName: string | null;
  teamName: string | null;
  isActive: boolean;
  pointsDeductionPerGw: number;
  role: "member" | "admin";
  source: "league" | "manual" | "invitation";
  addedAt: string;
  hasUserAccount: boolean;
  email?: string | null;
}

interface ListBody {
  success: boolean;
  data?: { members: Member[] };
  meta?: { total: number; page: number; limit: number };
  error?: string;
}

export default function LeagueAdminMembersPage() {
  const { league } = useLeague();
  const qc = useQueryClient();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-members", league.id, includeInactive],
    queryFn: async (): Promise<ListBody> => {
      const res = await fetch(
        `/api/leagues/${league.id}/members?limit=200${includeInactive ? "&includeInactive=1" : ""}`,
      );
      const body = (await res.json()) as ListBody;
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to load members");
      return body;
    },
    staleTime: 10_000,
  });

  const members = data?.data?.members ?? [];

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Members</h1>
          <p className="text-sm text-slate-500 mt-1">
            {members.length} {includeInactive ? "total" : "active"} member
            {members.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-600 inline-flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="rounded"
            />
            Show inactive
          </label>
          <Button variant="secondary" onClick={() => setInviteOpen(true)}>
            ✉ Invite by email
          </Button>
          <Button onClick={() => setAddOpen(true)}>+ Add member</Button>
        </div>
      </header>

      {addOpen && (
        <AddMemberDialog
          leagueId={league.id}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            qc.invalidateQueries({ queryKey: ["admin-members", league.id] });
          }}
        />
      )}

      {inviteOpen && (
        <InviteMemberDialog
          leagueId={league.id}
          onClose={() => setInviteOpen(false)}
          onIssued={() => {
            setInviteOpen(false);
            qc.invalidateQueries({ queryKey: ["admin-members", league.id] });
          }}
        />
      )}

      {isLoading && <div className="text-sm text-slate-500">Loading members…</div>}
      {isError && (
        <div className="bg-red-50 border border-red-200/80 text-red-700 px-4 py-3 rounded-xl text-sm">
          Unable to load member list.
        </div>
      )}

      {!isLoading && !isError && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-semibold">Manager</th>
                <th className="px-4 py-2 font-semibold">Team</th>
                <th className="px-4 py-2 font-semibold">Role</th>
                <th className="px-4 py-2 font-semibold">Deduction</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold">Email</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  leagueId={league.id}
                  member={m}
                  expanded={editingId === m.id}
                  onToggle={() => setEditingId(editingId === m.id ? null : m.id)}
                  onChanged={() => {
                    qc.invalidateQueries({ queryKey: ["admin-members", league.id] });
                  }}
                />
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                    No {includeInactive ? "" : "active "}members yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

// ── Row ────────────────────────────────────────────────────────────────────

function MemberRow({
  leagueId,
  member,
  expanded,
  onToggle,
  onChanged,
}: {
  leagueId: string;
  member: Member;
  expanded: boolean;
  onToggle: () => void;
  onChanged: () => void;
}) {
  return (
    <>
      <tr className="border-b border-slate-100 hover:bg-slate-50/50">
        <td className="px-4 py-3">
          <div className="font-medium text-slate-900">{member.displayName ?? "—"}</div>
          <div className="text-xs text-slate-400">#{member.managerId}</div>
        </td>
        <td className="px-4 py-3 text-slate-600">{member.teamName ?? "—"}</td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
              member.role === "admin"
                ? "bg-purple-100 text-purple-800"
                : "bg-slate-100 text-slate-700"
            }`}
          >
            {member.role}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-600">{member.pointsDeductionPerGw}</td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
              member.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
            }`}
          >
            {member.isActive ? "active" : "inactive"}
          </span>
        </td>
        <td className="px-4 py-3 text-slate-500 text-xs">
          {member.email ?? (member.hasUserAccount ? "(linked)" : "—")}
        </td>
        <td className="px-4 py-3 text-right">
          <Button variant="ghost" size="sm" onClick={onToggle}>
            {expanded ? "Close" : "Edit"}
          </Button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50/40">
          <td colSpan={7} className="px-4 py-4">
            <EditMemberPanel
              leagueId={leagueId}
              member={member}
              onChanged={() => {
                onChanged();
              }}
              onClose={onToggle}
            />
          </td>
        </tr>
      )}
    </>
  );
}

// ── Edit panel ─────────────────────────────────────────────────────────────

function EditMemberPanel({
  leagueId,
  member,
  onChanged,
  onClose,
}: {
  leagueId: string;
  member: Member;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [displayName, setDisplayName] = useState(member.displayName ?? "");
  const [role, setRole] = useState(member.role);
  const [pointsDeductionPerGw, setDeduction] = useState(member.pointsDeductionPerGw);
  const [isActive, setIsActive] = useState(member.isActive);
  const [email, setEmail] = useState(member.email ?? "");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const patchMutation = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const res = await fetch(`/api/leagues/${leagueId}/members/${member.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !body.success) throw new Error(body.error ?? "Update failed");
      return body;
    },
    onSuccess: () => {
      setFeedback("Saved.");
      setError(null);
      onChanged();
    },
    onError: (err: Error) => setError(err.message),
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/leagues/${leagueId}/members/${member.id}`, {
        method: "DELETE",
      });
      const body = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !body.success) throw new Error(body.error ?? "Remove failed");
      return body;
    },
    onSuccess: () => {
      onChanged();
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  function buildPatch(): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    if ((member.displayName ?? "") !== displayName) {
      patch.displayName = displayName.trim() || null;
    }
    if (member.role !== role) patch.role = role;
    if (member.pointsDeductionPerGw !== pointsDeductionPerGw) {
      patch.pointsDeductionPerGw = pointsDeductionPerGw;
    }
    if (member.isActive !== isActive) patch.isActive = isActive;
    if ((member.email ?? "") !== email.trim()) {
      patch.email = email.trim() || null;
    }
    return patch;
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    setError(null);
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      setFeedback("No changes.");
      return;
    }
    patchMutation.mutate(patch);
  }

  function handleRemove() {
    setFeedback(null);
    setError(null);
    if (
      !confirm(
        `Remove ${member.displayName ?? `manager #${member.managerId}`} from the league? This cannot be undone.`,
      )
    ) {
      return;
    }
    removeMutation.mutate();
  }

  const inputCls =
    "rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-[#37003c] focus:outline-none focus:ring-1 focus:ring-[#37003c]";

  return (
    <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <label className="block">
        <span className="block text-xs font-medium text-slate-700 mb-1">Display name</span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={80}
          className={`${inputCls} w-full`}
        />
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-slate-700 mb-1">Role</span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "member" | "admin")}
          className={`${inputCls} w-full`}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-slate-700 mb-1">
          Points deduction (per GW)
        </span>
        <input
          type="number"
          value={pointsDeductionPerGw}
          onChange={(e) => setDeduction(Number(e.target.value))}
          min={0}
          max={1000}
          className={`${inputCls} w-full`}
        />
      </label>

      <label className="block">
        <span className="block text-xs font-medium text-slate-700 mb-1">Active</span>
        <select
          value={isActive ? "1" : "0"}
          onChange={(e) => setIsActive(e.target.value === "1")}
          className={`${inputCls} w-full`}
        >
          <option value="1">Active</option>
          <option value="0">Inactive</option>
        </select>
      </label>

      <label className="block md:col-span-2">
        <span className="block text-xs font-medium text-slate-700 mb-1">
          Email {!member.hasUserAccount && (
            <span className="text-slate-400">(setting an email also sends an invitation)</span>
          )}
        </span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={`${inputCls} w-full`}
        />
      </label>

      <div className="md:col-span-2 flex items-center justify-between gap-3 pt-2 border-t border-slate-200">
        <div className="text-xs">
          {error && <span className="text-red-600">{error}</span>}
          {feedback && !error && <span className="text-emerald-600">{feedback}</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={handleRemove}
            disabled={removeMutation.isPending}
          >
            {removeMutation.isPending ? "Removing…" : "Remove from league"}
          </Button>
          <Button type="submit" size="sm" disabled={patchMutation.isPending}>
            {patchMutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>
    </form>
  );
}

// ── Add dialog ─────────────────────────────────────────────────────────────

function AddMemberDialog({
  leagueId,
  onClose,
  onAdded,
}: {
  leagueId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [managerId, setManagerId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { managerId: Number(managerId) };
      if (displayName.trim()) body.displayName = displayName.trim();
      if (email.trim()) body.email = email.trim();
      const res = await fetch(`/api/leagues/${leagueId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { success: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error ?? "Add failed");
      return json;
    },
    onSuccess: onAdded,
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!managerId || isNaN(Number(managerId))) {
      setError("Manager ID is required");
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
            <h2 className="text-lg font-semibold text-slate-900">Add member</h2>
            <p className="text-xs text-slate-500 mt-1">
              Adds a member by FPL Manager ID. Optional email sends a sign-in invitation.
            </p>
          </header>

          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">FPL Manager ID</span>
            <input
              type="number"
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              required
              min={1}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">
              Display name <span className="text-slate-400">(optional, falls back to FPL profile)</span>
            </span>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              className={inputCls}
            />
          </label>

          <label className="block">
            <span className="block text-xs font-medium text-slate-700 mb-1">
              Email <span className="text-slate-400">(optional, sends invitation)</span>
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              {mutation.isPending ? "Adding…" : "Add member"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
