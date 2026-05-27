"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useLeague } from "@/components/league/LeagueProvider";
import { HelpButton } from "@/components/manual/HelpButton";

interface LeagueSettings {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  miniLeagueId: number | null;
  status: "active" | "suspended";
  memberCount: number;
  adminCount: number;
  createdAt: string;
  suspensionReason: string | null;
  digestPrompt: string | null;
}

interface ApiBody<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export default function LeagueAdminSettingsPage() {
  const { league } = useLeague();
  const qc = useQueryClient();

  const { data, isLoading, isError } = useQuery<LeagueSettings>({
    queryKey: ["league-settings", league.id],
    queryFn: async () => {
      const res = await fetch(`/api/leagues/${league.id}`);
      const body = (await res.json()) as ApiBody<LeagueSettings>;
      if (!res.ok || !body.success || !body.data) {
        throw new Error(body.error ?? "Failed to load league");
      }
      return body.data;
    },
    staleTime: 30_000,
  });

  const [form, setForm] = useState<LeagueSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !form) {
    return <div className="text-sm text-slate-500">Loading league settings…</div>;
  }
  if (isError) {
    return (
      <div className="bg-red-50 border border-red-200/80 text-red-700 px-4 py-3 rounded-xl text-sm">
        Unable to load league settings.
      </div>
    );
  }

  const dirty =
    !data ||
    form.name !== data.name ||
    form.slug !== data.slug ||
    form.logoUrl !== data.logoUrl ||
    form.miniLeagueId !== data.miniLeagueId ||
    form.digestPrompt !== data.digestPrompt;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !data) return;
    setSaving(true);
    setFeedback(null);
    try {
      const patch: Record<string, unknown> = {};
      if (form.name !== data.name) patch.name = form.name.trim();
      if (form.slug !== data.slug) patch.slug = form.slug.trim();
      if (form.logoUrl !== data.logoUrl) patch.logoUrl = form.logoUrl?.trim() || null;
      if (form.miniLeagueId !== data.miniLeagueId) patch.miniLeagueId = form.miniLeagueId;
      if (form.digestPrompt !== data.digestPrompt) {
        patch.digestPrompt = form.digestPrompt?.trim() || null;
      }
      const res = await fetch(`/api/leagues/${league.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = (await res.json()) as ApiBody<LeagueSettings>;
      if (!res.ok || !body.success || !body.data) {
        throw new Error(body.error ?? "Save failed");
      }
      qc.setQueryData(["league-settings", league.id], body.data);
      setForm(body.data);
      setFeedback({ kind: "ok", message: "Saved." });
    } catch (err) {
      setFeedback({ kind: "error", message: err instanceof Error ? err.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">League settings</h1>
          <p className="text-sm text-slate-500 mt-1">
            {form.memberCount} member{form.memberCount === 1 ? "" : "s"} · {form.adminCount} admin
            {form.adminCount === 1 ? "" : "s"} · created {new Date(form.createdAt).toLocaleDateString()}
          </p>
        </div>
        <HelpButton topic="/help/league-admin/league-settings" />
      </header>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">Basics</h2>
        </CardHeader>
        <CardBody>
          <form onSubmit={handleSave} className="space-y-4">
            <Field label="League name">
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                maxLength={80}
                className={inputCls}
              />
            </Field>

            <Field
              label="URL slug"
              hint="Lowercase letters, numbers, and hyphens. Old slugs continue to work after a change."
            >
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
                required
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                maxLength={60}
                className={inputCls}
              />
            </Field>

            <Field label="Logo URL">
              <input
                type="url"
                value={form.logoUrl ?? ""}
                onChange={(e) => setForm({ ...form, logoUrl: e.target.value || null })}
                placeholder="https://example.com/logo.png"
                className={inputCls}
              />
            </Field>

            <Field
              label="FPL mini-league ID"
              hint="Numeric ID from the FPL classic mini-league URL. Used by the sync action and live data."
            >
              <input
                type="number"
                value={form.miniLeagueId ?? ""}
                onChange={(e) =>
                  setForm({
                    ...form,
                    miniLeagueId: e.target.value ? Number(e.target.value) : null,
                  })
                }
                min={1}
                className={inputCls}
              />
            </Field>

            <Field
              label="Digest prompt override"
              hint="Optional. Tone and persona for the gameweek digest emails. Leave blank to use the platform default."
            >
              <textarea
                value={form.digestPrompt ?? ""}
                onChange={(e) =>
                  setForm({ ...form, digestPrompt: e.target.value ? e.target.value : null })
                }
                rows={6}
                maxLength={2000}
                className={`${inputCls} font-mono text-xs`}
              />
            </Field>

            <div className="flex items-center justify-between pt-2">
              <div className="text-sm">
                {feedback && (
                  <span className={feedback.kind === "ok" ? "text-emerald-600" : "text-red-600"}>
                    {feedback.message}
                  </span>
                )}
              </div>
              <Button type="submit" disabled={!dirty || saving}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <SyncCard leagueId={league.id} miniLeagueId={form.miniLeagueId} dirty={dirty} />
    </div>
  );
}

// ── Sync card ──────────────────────────────────────────────────────────────

interface SyncResult {
  added: number;
  refreshed: number;
  total: number;
}

function SyncCard({
  leagueId,
  miniLeagueId,
  dirty,
}: {
  leagueId: string;
  miniLeagueId: number | null;
  dirty: boolean;
}) {
  const qc = useQueryClient();
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      const res = await fetch(`/api/leagues/${leagueId}/sync`, { method: "POST" });
      const body = (await res.json()) as { success: boolean; data?: SyncResult; error?: string };
      if (!res.ok || !body.success || !body.data) {
        throw new Error(body.error ?? "Sync failed");
      }
      return body.data;
    },
    onSuccess: (data) => {
      setResult(data);
      setError(null);
      qc.invalidateQueries({ queryKey: ["admin-members", leagueId] });
      qc.invalidateQueries({ queryKey: ["league-settings", leagueId] });
    },
    onError: (err: Error) => {
      setResult(null);
      setError(err.message);
    },
  });

  const canSync = miniLeagueId !== null && !dirty;

  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-slate-900">FPL sync</h2>
      </CardHeader>
      <CardBody className="space-y-3">
        <p className="text-xs text-slate-500">
          Re-imports members from the configured FPL mini-league. Existing members keep their
          customisations; new managers in the mini-league get added as league-sourced members.
          Manually-added and invited members are never touched by sync.
        </p>
        {miniLeagueId === null && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
            Set a mini-league ID above and save before running sync.
          </p>
        )}
        {dirty && miniLeagueId !== null && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded">
            Save your changes before running sync.
          </p>
        )}
        <div className="flex items-center justify-between pt-1">
          <div className="text-xs">
            {error && <span className="text-red-600">{error}</span>}
            {result && (
              <span className="text-emerald-600">
                Sync complete — {result.added} added, {result.refreshed} refreshed,{" "}
                {result.total} total active.
              </span>
            )}
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={!canSync || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? "Syncing…" : "Sync from FPL"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-[#37003c] focus:outline-none focus:ring-1 focus:ring-[#37003c]";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}
