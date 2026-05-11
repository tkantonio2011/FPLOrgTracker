"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface UserRow {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  disabledAt: string | null;
  isSuperAdmin: boolean;
  membershipCount: number;
}

interface ListBody {
  success: boolean;
  data?: UserRow[];
  meta?: { total: number; page: number; limit: number };
  error?: string;
}

interface MutationBody {
  success: boolean;
  data?: unknown;
  error?: string;
}

const PAGE_SIZE = 25;

export default function PlatformUsersPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [disabledOnly, setDisabledOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const queryKey = ["platform-users", page, search, disabledOnly];

  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async (): Promise<ListBody> => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (search) params.set("search", search);
      if (disabledOnly) params.set("disabledOnly", "1");
      const res = await fetch(`/api/platform/users?${params.toString()}`);
      const body = (await res.json()) as ListBody;
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to load users");
      return body;
    },
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["platform-users"] });
  }

  const grantSuper = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/platform/users/${userId}/super-admin`, { method: "POST" });
      const body = (await res.json()) as MutationBody;
      if (!res.ok || !body.success) throw new Error(body.error ?? "Grant failed");
    },
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err: Error) => setError(err.message),
  });

  const revokeSuper = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/platform/users/${userId}/super-admin`, { method: "DELETE" });
      const body = (await res.json()) as MutationBody;
      if (!res.ok || !body.success) throw new Error(body.error ?? "Revoke failed");
    },
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err: Error) => setError(err.message),
  });

  const disable = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/platform/users/${userId}/disable`, { method: "POST" });
      const body = (await res.json()) as MutationBody;
      if (!res.ok || !body.success) throw new Error(body.error ?? "Disable failed");
    },
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err: Error) => setError(err.message),
  });

  const enable = useMutation({
    mutationFn: async (userId: string) => {
      const res = await fetch(`/api/platform/users/${userId}/enable`, { method: "POST" });
      const body = (await res.json()) as MutationBody;
      if (!res.ok || !body.success) throw new Error(body.error ?? "Enable failed");
    },
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err: Error) => setError(err.message),
  });

  const users = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  const anyPending =
    grantSuper.isPending || revokeSuper.isPending || disable.isPending || enable.isPending;

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500 mt-1">
            {total} {disabledOnly ? "disabled" : "total"} user{total === 1 ? "" : "s"}
          </p>
        </div>
      </header>

      <Card className="px-4 py-3 flex flex-wrap items-center gap-3">
        <form onSubmit={applySearch} className="flex items-center gap-2 flex-1 min-w-[220px]">
          <input
            type="search"
            placeholder="Search email…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm shadow-sm focus:border-[#37003c] focus:outline-none focus:ring-1 focus:ring-[#37003c]"
          />
          <Button type="submit" variant="secondary" size="sm">
            Search
          </Button>
          {search && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchInput("");
                setSearch("");
                setPage(1);
              }}
            >
              Clear
            </Button>
          )}
        </form>
        <label className="text-xs text-slate-600 inline-flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={disabledOnly}
            onChange={(e) => {
              setDisabledOnly(e.target.checked);
              setPage(1);
            }}
            className="rounded"
          />
          Disabled only
        </label>
      </Card>

      {error && (
        <div className="bg-red-50 border border-red-200/80 text-red-700 px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {isLoading && <div className="text-sm text-slate-500">Loading…</div>}
      {isError && !error && (
        <div className="bg-red-50 border border-red-200/80 text-red-700 px-4 py-3 rounded-xl text-sm">
          Unable to load users.
        </div>
      )}

      {!isLoading && !isError && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-semibold">Email</th>
                <th className="px-4 py-2 font-semibold">Roles</th>
                <th className="px-4 py-2 font-semibold text-right">Leagues</th>
                <th className="px-4 py-2 font-semibold">Last sign-in</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-100">
                  <td className="px-4 py-3">
                    <div className="text-slate-900">{u.email}</div>
                    {u.displayName && (
                      <div className="text-xs text-slate-400">{u.displayName}</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {u.isSuperAdmin ? (
                      <span className="inline-flex items-center rounded-full bg-[#37003c] text-white px-2 py-0.5 text-xs font-medium">
                        Super Admin
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{u.membershipCount}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {u.lastLoginAt ? formatDate(u.lastLoginAt) : <span className="text-slate-300">never</span>}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {u.disabledAt ? (
                      <span className="text-red-700">Disabled</span>
                    ) : (
                      <span className="text-emerald-700">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-1">
                      {u.isSuperAdmin ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={anyPending}
                          onClick={() => revokeSuper.mutate(u.id)}
                        >
                          Revoke SA
                        </Button>
                      ) : (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={anyPending}
                          onClick={() => grantSuper.mutate(u.id)}
                        >
                          Grant SA
                        </Button>
                      )}
                      {u.disabledAt ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={anyPending}
                          onClick={() => enable.mutate(u.id)}
                        >
                          Enable
                        </Button>
                      ) : (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={anyPending}
                          onClick={() => {
                            if (confirm(`Disable ${u.email}? They will be signed out immediately.`)) {
                              disable.mutate(u.id);
                            }
                          }}
                        >
                          Disable
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                    {search || disabledOnly
                      ? "No users match the current filter."
                      : "No user accounts yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-xs text-slate-500">
              <span>
                Page {page} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
