import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Never cache — org data changes on every save/sync and must always be live.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const org = await db.organisation.findFirst({
      include: {
        members: {
          where: { isActive: true },
          orderBy: { addedAt: "asc" },
          include: { user: { select: { createdAt: true, lastLoginAt: true } } },
        },
      },
    });

    if (!org) {
      return NextResponse.json({ error: "Organisation not configured", code: "ORG_NOT_CONFIGURED" }, { status: 404 });
    }

    return NextResponse.json({
      id: org.id,
      name: org.name,
      miniLeagueId: org.miniLeagueId,
      members: org.members.map((m) => ({
        id: m.id,
        managerId: m.managerId,
        displayName: m.displayName ?? m.teamName ?? `Manager ${m.managerId}`,
        teamName: m.teamName,
        source: m.source,
        isActive: m.isActive,
        registeredAt: m.user?.createdAt ?? null,
        lastLoginAt: m.user?.lastLoginAt ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Database error", code: "DB_ERROR" }, { status: 500 });
  }
}
