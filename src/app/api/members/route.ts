import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchEntry } from "@/lib/fpl/client";
import { isAdminRequest } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const members = await db.member.findMany({
      where: { isActive: true },
      orderBy: { addedAt: "asc" },
    });
    return NextResponse.json({ members });
  } catch {
    return NextResponse.json({ error: "Database error", code: "DB_ERROR" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorised", code: "UNAUTHORISED" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { managerId } = body as { managerId?: number };

    if (!managerId || typeof managerId !== "number") {
      return NextResponse.json({ error: "managerId must be a number", code: "VALIDATION_ERROR" }, { status: 422 });
    }

    const org = await db.organisation.findFirst();
    if (!org) {
      return NextResponse.json({ error: "Organisation not configured", code: "ORG_NOT_CONFIGURED" }, { status: 404 });
    }

    const existing = await db.member.findUnique({ where: { managerId } });
    if (existing) {
      if (existing.isActive) {
        return NextResponse.json({ error: "Member already exists", code: "MEMBER_ALREADY_EXISTS" }, { status: 409 });
      }
      const updated = await db.member.update({ where: { id: existing.id }, data: { isActive: true } });
      return NextResponse.json(updated, { status: 201 });
    }

    // Fetch manager details from FPL
    let displayName: string | undefined;
    let teamName: string | undefined;
    try {
      const entry = await fetchEntry(managerId);
      displayName = `${entry.player_first_name} ${entry.player_last_name}`;
      teamName = entry.name;
    } catch {
      // FPL API unavailable — add member without names, they can be updated later
    }

    const member = await db.member.create({
      data: { managerId, displayName, teamName, source: "manual", isActive: true, organisationId: org.id },
    });

    return NextResponse.json(member, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to add member", code: "DB_ERROR" }, { status: 500 });
  }
}
