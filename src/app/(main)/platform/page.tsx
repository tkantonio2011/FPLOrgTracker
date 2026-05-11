"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface PlatformLeagueRow {
  id: string;
  slug: string;
  name: string;
  status: "active" | "suspended";
  memberCount: number;
  adminCount: number;
  miniLeagueId: number | null;
  createdAt: string;
  suspendedAt: string | null;
  lastActivityAt: string | null;
}

interface ListBody {
  success: boolean;
  data?: PlatformLeagueRow[];
  meta?: { total: number; page: number; limit: number };
  error?: string;
}

const PAGE_SIZE = 25;

type StatusFilter = "all" | "active" | "suspended";

export default function PlatformDashboardPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["platform-leagues", page, status, search],
    queryFn: async (): Promise<ListBody> => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
      });
      if (status !== "all") params.set("status", status);
      if (search) params.set("search", search);
      const res = await fetch(`/api/platform/leagues?${params.toString()}`);
      const body = (await res.json()) as ListBody;
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to load leagues");
      return body;
    },
    placeholderData: keepPreviousData,
    staleTime: 10_000,
  });

  const leagues = data?.data ?? [];
  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Leagues</h1>
          <p className="text-sm text-slate-500 mt-1">
            {total} {status === "all" ? "total" : status} league{total === 1 ? "" : "s"}
          </p>
        </div>
        <Link href="/platform/leagues/new">
          <Button>+ New league</Button>
        </Link>
      </header>

      <Card className="px-4 py-3 flex flex-wrap items-center gap-3">
        <form onSubmit={applySearch} className="flex items-center gap-2 flex-1 min-w-[220px]">
          <input
            type="search"
            placeholder="Search name or slug…"
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
        <div className="flex items-center gap-1 text-xs">
          {(["all", "active", "suspended"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                setStatus(opt);
                setPage(1);
              }}
              className={`px-2.5 py-1 rounded-md font-medium ${
                status === opt
                  ? "bg-[#37003c] text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {opt === "all" ? "All" : opt[0].toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </Card>

      {isLoading && <div className="text-sm text-slate-500">Loading…</div>}
      {isError && (
        <div className="bg-red-50 border border-red-200/80 text-red-700 px-4 py-3 rounded-xl text-sm">
          Unable to load leagues.
        </div>
      )}

      {!isLoading && !isError && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2 font-semibold">League</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold text-right">Members</th>
                <th className="px-4 py-2 font-semibold text-right">Admins</th>
                <th className="px-4 py-2 font-semibold">FPL ID</th>
                <th className="px-4 py-2 font-semibold">Created</th>
                <th className="px-4 py-2 font-semibold">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {leagues.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="px-4 py-3">
                    <Link
                      href={`/platform/leagues/${l.id}`}
                      className="font-medium text-slate-900 hover:text-[#37003c]"
                    >
                      {l.name}
                    </Link>
                    <div className="text-xs text-slate-400 font-mono">/{l.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={l.status} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.memberCount}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{l.adminCount}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 font-mono">
                    {l.miniLeagueId ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">{formatDate(l.createdAt)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {l.lastActivityAt ? formatDate(l.lastActivityAt) : <span className="text-slate-300">—</span>}
                  </td>
                </tr>
              ))}
              {leagues.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                    {search || status !== "all"
                      ? "No leagues match the current filter."
                      : "No leagues yet. Create the first one with the button above."}
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

function StatusBadge({ status }: { status: "active" | "suspended" }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 text-xs font-medium">
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 text-xs font-medium">
      Suspended
    </span>
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
