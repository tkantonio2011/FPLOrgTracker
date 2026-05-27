/**
 * Invitation acceptance page. Server Component reads the token directly from
 * the URL, peeks the invitation (does not consume), and renders the details.
 * The form submits to `/api/invitations/{token}/accept`, which consumes the
 * token, creates the LeagueMembership, signs the user in, and redirects.
 */

import { db } from "@/lib/db";
import { peekInvitationToken } from "@/lib/auth/magic-link";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { InvitationAcceptForm } from "@/components/league/InvitationAcceptForm";

export const dynamic = "force-dynamic";

interface InvitationViewModel {
  token: string;
  leagueName: string;
  leagueLogoUrl: string | null;
  role: "member" | "admin";
  presuppliedManagerId: number | null;
  presuppliedDisplayName: string | null;
  inviterEmail: string;
  inviteeEmail: string;
  expiresAt: string;
}

async function loadInvitation(
  token: string,
): Promise<{ ok: true; vm: InvitationViewModel } | { ok: false; reason: string }> {
  const peek = await peekInvitationToken(token);
  if (!peek.ok) {
    const reason =
      peek.reason === "used"
        ? "This invitation has already been accepted."
        : peek.reason === "expired"
          ? "This invitation link has expired. Ask the league admin to send a new one."
          : "This invitation link is invalid.";
    return { ok: false, reason };
  }

  const invitation = await db.invitation.findUnique({
    where: { id: peek.invitationId },
    include: {
      league: { select: { name: true, logoUrl: true, status: true } },
      invitedByUserAccount: { select: { email: true } },
    },
  });
  if (!invitation) return { ok: false, reason: "This invitation could not be found." };
  if (invitation.acceptedAt) {
    return { ok: false, reason: "This invitation has already been accepted." };
  }
  if (invitation.revokedAt) return { ok: false, reason: "This invitation has been revoked." };
  if (invitation.league.status === "suspended") {
    return { ok: false, reason: "This league is currently suspended." };
  }

  return {
    ok: true,
    vm: {
      token,
      leagueName: invitation.league.name,
      leagueLogoUrl: invitation.league.logoUrl,
      role: invitation.role === "admin" ? "admin" : "member",
      presuppliedManagerId: invitation.managerId,
      presuppliedDisplayName: invitation.displayName,
      inviterEmail: invitation.invitedByUserAccount.email,
      inviteeEmail: invitation.email,
      expiresAt: peek.expiresAt.toISOString(),
    },
  };
}

export default async function InvitationAcceptPage({
  params,
}: {
  params: { token: string };
}) {
  const result = await loadInvitation(params.token);

  if (!result.ok) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <h1 className="text-lg font-semibold text-slate-900">Invitation unavailable</h1>
          </CardHeader>
          <CardBody>
            <p className="text-sm text-slate-600">{result.reason}</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="flex items-center gap-3">
            {result.vm.leagueLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={result.vm.leagueLogoUrl}
                alt=""
                className="w-10 h-10 rounded object-cover border border-slate-200"
              />
            )}
            <div>
              <h1 className="text-lg font-semibold text-slate-900">
                Join {result.vm.leagueName}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Invited by {result.vm.inviterEmail} · {result.vm.role}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-slate-600 mb-4">
            Confirm the details below to accept your invitation. You&apos;ll be signed in
            automatically.
          </p>
          <InvitationAcceptForm
            token={result.vm.token}
            inviteeEmail={result.vm.inviteeEmail}
            presuppliedManagerId={result.vm.presuppliedManagerId}
            presuppliedDisplayName={result.vm.presuppliedDisplayName}
          />
        </CardBody>
      </Card>
    </div>
  );
}
