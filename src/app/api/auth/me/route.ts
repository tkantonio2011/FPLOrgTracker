import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSessionManagerId } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const managerId = getSessionManagerId(req);
  if (!managerId)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const user = await db.user.findUnique({
    where:   { managerId },
    include: { member: { select: { displayName: true, teamName: true, isActive: true } } },
  });

  if (!user || !user.member.isActive)
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  return NextResponse.json({
    managerId,
    displayName: user.member.displayName,
    teamName:    user.member.teamName,
  });
}
