/**
 * League settings endpoint.
 *
 * GET   — visible to any league member (Super Admin bypasses), returns
 *         the league shape used by the admin settings page (T053) and
 *         the platform single-league view (T072).
 * PATCH — League Admin only. Slug changes write a `LeagueSlugHistory` row
 *         so old URLs continue to resolve via `league-resolver.ts`.
 *
 * Contract: specs/002-multi-league-platform/contracts/league-contracts.md
 */

import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireLeagueAdmin, requireLeagueMember } from "@/lib/authz/league-scope";
import { ok, fail, failFromError } from "@/lib/http/response";
import { logAuditEvent } from "@/lib/audit/log";
import {
  parseBody,
  z,
  slugSchema,
  leagueNameSchema,
} from "@/lib/validation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface LeagueShape {
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

async function loadLeagueShape(leagueId: string): Promise<LeagueShape | null> {
  const league = await db.league.findUnique({ where: { id: leagueId } });
  if (!league) return null;
  const [memberCount, adminCount] = await Promise.all([
    db.leagueMembership.count({ where: { leagueId, isActive: true } }),
    db.leagueMembership.count({ where: { leagueId, isActive: true, role: "admin" } }),
  ]);
  return {
    id: league.id,
    slug: league.slug,
    name: league.name,
    logoUrl: league.logoUrl,
    miniLeagueId: league.miniLeagueId,
    status: league.status === "suspended" ? "suspended" : "active",
    memberCount,
    adminCount,
    createdAt: league.createdAt.toISOString(),
    suspensionReason: league.suspensionReason,
    digestPrompt: league.digestPrompt,
  };
}

export async function GET(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league } = await requireLeagueMember(req, ctx.params.leagueId);
    const shape = await loadLeagueShape(league.id);
    if (!shape) return fail("League not found", 404);
    return ok(shape);
  } catch (err) {
    return failFromError(err);
  }
}

const patchSchema = z
  .object({
    name: leagueNameSchema.optional(),
    slug: slugSchema.optional(),
    logoUrl: z.string().url().nullable().optional(),
    miniLeagueId: z.number().int().positive().nullable().optional(),
    digestPrompt: z.string().max(2000).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Empty update" });

export async function PATCH(req: NextRequest, ctx: { params: { leagueId: string } }) {
  try {
    const { league, user } = await requireLeagueAdmin(req, ctx.params.leagueId);
    const body = await parseBody(req, patchSchema);

    // The resolver-returned `league` is a narrow projection (no digestPrompt
    // etc.) — fetch the full row so we can compute the before/after diff.
    const fullLeague = await db.league.findUnique({ where: { id: league.id } });
    if (!fullLeague) return fail("League not found", 404);

    // Detect slug collision early — Prisma's unique constraint would throw a
    // P2002 anyway, but we want the user-facing error to be a clean 409.
    if (body.slug && body.slug !== league.slug) {
      const taken = await db.league.findUnique({ where: { slug: body.slug }, select: { id: true } });
      if (taken && taken.id !== league.id) return fail("Slug already in use", 409);
      const historical = await db.leagueSlugHistory.findUnique({
        where: { slug: body.slug },
        select: { leagueId: true },
      });
      if (historical && historical.leagueId !== league.id) {
        return fail("Slug already in use", 409);
      }
    }

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const updates: Record<string, unknown> = {};

    if (body.name !== undefined && body.name !== league.name) {
      before.name = league.name; after.name = body.name; updates.name = body.name;
    }
    if (body.slug !== undefined && body.slug !== league.slug) {
      before.slug = league.slug; after.slug = body.slug; updates.slug = body.slug;
    }
    if (body.logoUrl !== undefined && body.logoUrl !== league.logoUrl) {
      before.logoUrl = league.logoUrl; after.logoUrl = body.logoUrl; updates.logoUrl = body.logoUrl;
    }
    if (body.miniLeagueId !== undefined && body.miniLeagueId !== league.miniLeagueId) {
      // Re-check uniqueness on miniLeagueId: another league might already own it.
      if (body.miniLeagueId !== null) {
        const owner = await db.league.findUnique({
          where: { miniLeagueId: body.miniLeagueId },
          select: { id: true },
        });
        if (owner && owner.id !== league.id) {
          return fail("Mini-league ID already linked to another league", 409);
        }
      }
      before.miniLeagueId = league.miniLeagueId;
      after.miniLeagueId = body.miniLeagueId;
      updates.miniLeagueId = body.miniLeagueId;
    }
    if (body.digestPrompt !== undefined && body.digestPrompt !== fullLeague.digestPrompt) {
      before.digestPrompt = fullLeague.digestPrompt;
      after.digestPrompt = body.digestPrompt;
      updates.digestPrompt = body.digestPrompt;
    }

    if (Object.keys(updates).length === 0) {
      const shape = await loadLeagueShape(league.id);
      return ok(shape!);
    }

    await db.$transaction(async (tx) => {
      if (updates.slug) {
        // Preserve the previous slug so old URLs still resolve via the resolver.
        await tx.leagueSlugHistory.create({
          data: { leagueId: league.id, slug: league.slug },
        });
      }
      await tx.league.update({ where: { id: league.id }, data: updates });
    });

    await logAuditEvent({
      leagueId: league.id,
      actorUserAccountId: user.userAccount.id,
      action: "league.updated",
      targetKind: "league",
      targetId: league.id,
      details: { before, after },
    });

    const shape = await loadLeagueShape(league.id);
    return ok(shape!);
  } catch (err) {
    return failFromError(err);
  }
}
