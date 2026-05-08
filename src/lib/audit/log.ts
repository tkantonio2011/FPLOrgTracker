/**
 * Audit logger. Fire-and-forget — never blocks the request, never throws.
 *
 * Action catalogue is documented in specs/002-multi-league-platform/data-model.md
 * (search for "Action catalog"). Use stable string identifiers; new actions are
 * additive.
 */

import { db } from "@/lib/db";

export type AuditActorKind = "user" | "migration" | "system";

export type AuditTargetKind =
  | "league"
  | "membership"
  | "user_account"
  | "invitation"
  | "super_admin"
  | "session";

export interface AuditEventInput {
  leagueId?: string | null;
  actorUserAccountId?: string | null;
  actorKind?: AuditActorKind;
  action: string;
  targetKind: AuditTargetKind;
  targetId?: string | null;
  details?: Record<string, unknown>;
  requestIp?: string | null;
}

export async function logAuditEvent(input: AuditEventInput): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        leagueId: input.leagueId ?? null,
        actorUserAccountId: input.actorUserAccountId ?? null,
        actorKind: input.actorKind ?? "user",
        action: input.action,
        targetKind: input.targetKind,
        targetId: input.targetId ?? null,
        details: input.details ? JSON.stringify(input.details) : null,
        requestIp: input.requestIp ?? null,
      },
    });
  } catch (err) {
    // Audit logging must never break the user-facing request path.
    // eslint-disable-next-line no-console
    console.error("[audit] failed to log event:", input.action, err);
  }
}
