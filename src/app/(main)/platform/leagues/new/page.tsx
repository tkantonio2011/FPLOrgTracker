"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

interface CreateBody {
  name: string;
  slug?: string;
  miniLeagueId?: number | null;
  logoUrl?: string | null;
  initialAdminEmail: string;
  initialAdminManagerId?: number;
  initialAdminDisplayName?: string;
}

interface CreateResult {
  leagueId: string;
  leagueSlug: string;
  initialAdminInvitationId: string;
}

interface ApiBody<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export default function NewPlatformLeaguePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [miniLeagueId, setMiniLeagueId] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [initialAdminEmail, setInitialAdminEmail] = useState("");
  const [initialAdminManagerId, setInitialAdminManagerId] = useState("");
  const [initialAdminDisplayName, setInitialAdminDisplayName] = useState("");

  const mutation = useMutation({
    mutationFn: async (body: CreateBody): Promise<CreateResult> => {
      const res = await fetch("/api/platform/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as ApiBody<CreateResult>;
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Failed to create league");
      }
      return json.data;
    },
    onSuccess: (data) => {
      // The single-league view (T072) is not yet built — return to the
      // dashboard where the new league appears in the list.
      router.push(`/platform?created=${encodeURIComponent(data.leagueSlug)}`);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mutation.isPending) return;
    const body: CreateBody = {
      name: name.trim(),
      initialAdminEmail: initialAdminEmail.trim(),
    };
    if (slug.trim()) body.slug = slug.trim();
    if (miniLeagueId.trim()) body.miniLeagueId = Number(miniLeagueId);
    if (logoUrl.trim()) body.logoUrl = logoUrl.trim();
    if (initialAdminManagerId.trim()) body.initialAdminManagerId = Number(initialAdminManagerId);
    if (initialAdminDisplayName.trim()) body.initialAdminDisplayName = initialAdminDisplayName.trim();
    mutation.mutate(body);
  }

  const canSubmit = name.trim().length > 0 && initialAdminEmail.trim().length > 0 && !mutation.isPending;

  return (
    <div className="space-y-5 max-w-3xl">
      <header>
        <Link href="/platform" className="text-xs text-slate-500 hover:text-slate-900">
          ← Back to leagues
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 mt-2">New league</h1>
        <p className="text-sm text-slate-500 mt-1">
          Create a league and invite its first admin. The admin receives a magic-link email
          and joins as League Admin on acceptance.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-900">League</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <Field label="League name" required>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={80}
                placeholder="Friday Night Fantasy"
                className={inputCls}
              />
            </Field>

            <Field
              label="URL slug"
              hint="Leave blank to auto-generate from the league name. Lowercase letters, numbers, hyphens."
            >
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                maxLength={60}
                placeholder="friday-night-fantasy"
                className={inputCls}
              />
            </Field>

            <Field
              label="FPL mini-league ID"
              hint="Numeric ID from the FPL classic mini-league URL. Optional — the admin can add it later."
            >
              <input
                type="number"
                value={miniLeagueId}
                onChange={(e) => setMiniLeagueId(e.target.value)}
                min={1}
                className={inputCls}
              />
            </Field>

            <Field label="Logo URL" hint="Optional. Displayed in the league header for members.">
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://example.com/logo.png"
                className={inputCls}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-900">Initial admin</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <Field label="Email" required>
              <input
                type="email"
                value={initialAdminEmail}
                onChange={(e) => setInitialAdminEmail(e.target.value)}
                required
                className={inputCls}
                placeholder="admin@example.com"
              />
            </Field>

            <Field
              label="FPL Manager ID"
              hint="Optional. If omitted, the admin supplies it when accepting the invitation."
            >
              <input
                type="number"
                value={initialAdminManagerId}
                onChange={(e) => setInitialAdminManagerId(e.target.value)}
                min={1}
                className={inputCls}
              />
            </Field>

            <Field
              label="Display name"
              hint="Optional. The admin can override this when accepting the invitation."
            >
              <input
                type="text"
                value={initialAdminDisplayName}
                onChange={(e) => setInitialAdminDisplayName(e.target.value)}
                maxLength={80}
                className={inputCls}
              />
            </Field>
          </CardBody>
        </Card>

        <div className="flex items-center justify-between pt-2">
          <div className="text-sm">
            {mutation.isError && (
              <span className="text-red-600">{(mutation.error as Error).message}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href="/platform">
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </Link>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending ? "Creating…" : "Create league & send invitation"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-[#37003c] focus:outline-none focus:ring-1 focus:ring-[#37003c]";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs text-slate-400 mt-1">{hint}</span>}
    </label>
  );
}
