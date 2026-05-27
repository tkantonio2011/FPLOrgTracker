"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useLeague } from "@/components/league/LeagueProvider";

import { HelpButton } from "@/components/manual/HelpButton";
interface ConfigStatus {
  smtpConfigured: boolean;
  groqConfigured: boolean;
}

interface SendResult {
  gw: number;
  recipients: number;
}

interface ApiBody<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export default function LeagueAdminDigestPage() {
  const { league } = useLeague();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SendResult | null>(null);

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ["league-digest-status", league.id],
    queryFn: async (): Promise<ConfigStatus> => {
      const res = await fetch(`/api/leagues/${league.id}/digest`);
      const body = (await res.json()) as ApiBody<ConfigStatus>;
      if (!res.ok || !body.success || !body.data) {
        throw new Error(body.error ?? "Failed to load digest status");
      }
      return body.data;
    },
    staleTime: 30_000,
  });

  const sendDigest = useMutation({
    mutationFn: async (): Promise<SendResult> => {
      const res = await fetch(`/api/leagues/${league.id}/digest`, {
        method: "POST",
      });
      const body = (await res.json()) as ApiBody<SendResult>;
      if (!res.ok || !body.success || !body.data) {
        throw new Error(body.error ?? "Failed to send digest");
      }
      return body.data;
    },
    onSuccess: (data) => {
      setError(null);
      setSuccess(data);
    },
    onError: (err: Error) => {
      setSuccess(null);
      setError(err.message);
    },
  });

  const canSend =
    !!status?.smtpConfigured && !!status?.groqConfigured && !sendDigest.isPending;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900">GW digest</h1>
        <HelpButton topic="/help/league-admin/weekly-digest" />
        <p className="text-sm text-slate-500 mt-1">
          Send an AI-generated gameweek summary email to every active member of this league with
          an email on file. Cached per GW — repeat sends for the same GW skip Groq entirely.
        </p>
      </header>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">Configuration</h2>
        </CardHeader>
        <CardBody className="space-y-3">
          {statusLoading && <p className="text-xs text-slate-500">Checking configuration…</p>}
          {status && (
            <div className="space-y-2 text-xs">
              <ConfigRow label="SMTP" ok={status.smtpConfigured}>
                {status.smtpConfigured ? (
                  "SMTP configured — emails will be delivered."
                ) : (
                  <span>
                    SMTP not configured. Set <code className="font-mono">SMTP_HOST</code>,{" "}
                    <code className="font-mono">SMTP_PORT</code>,{" "}
                    <code className="font-mono">SMTP_USER</code>,{" "}
                    <code className="font-mono">SMTP_PASS</code>, and{" "}
                    <code className="font-mono">SMTP_FROM</code> in the deployment environment.
                  </span>
                )}
              </ConfigRow>
              <ConfigRow label="Groq" ok={status.groqConfigured}>
                {status.groqConfigured ? (
                  "Groq configured — narrative generation available."
                ) : (
                  <span>
                    Groq not configured. Set <code className="font-mono">GROQ_API_KEY</code>{" "}
                    in the deployment environment. Free keys at{" "}
                    <span className="font-mono">console.groq.com/keys</span>.
                  </span>
                )}
              </ConfigRow>
            </div>
          )}
          <p className="text-xs text-slate-400 pt-1">
            Tone and style customise via the{" "}
            <Link
              href={`/l/${league.slug}/admin/settings`}
              className="text-[#37003c] hover:underline"
            >
              digest prompt
            </Link>{" "}
            on the settings page. Recipients = active members with an email on the linked user
            account; attach emails on the{" "}
            <Link
              href={`/l/${league.slug}/admin/members`}
              className="text-[#37003c] hover:underline"
            >
              members
            </Link>{" "}
            page.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-slate-900">Send now</h2>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs text-slate-500">
            Sends the digest for the most-recently-finished gameweek. The first send for a new
            GW invokes Groq once for the summary plus once per manager (sequential, 1 s apart to
            stay under the free-tier TPM limit). Subsequent sends for the same GW reuse the
            cached output.
          </p>
          <div className="flex items-center justify-between pt-1">
            <div className="text-xs">
              {error && <span className="text-red-600">{error}</span>}
              {success && (
                <span className="text-emerald-600">
                  GW{success.gw} digest sent to {success.recipients} recipient
                  {success.recipients === 1 ? "" : "s"}.
                </span>
              )}
            </div>
            <Button onClick={() => sendDigest.mutate()} disabled={!canSend}>
              {sendDigest.isPending ? "Sending…" : "Send GW digest now"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function ConfigRow({
  label,
  ok,
  children,
}: {
  label: string;
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`px-3 py-2 rounded-lg border ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}
    >
      <span className="font-semibold mr-2">{label}:</span>
      {children}
    </div>
  );
}
