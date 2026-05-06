import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, buildUserToken, USER_COOKIE_NAME, USER_COOKIE_MAX_AGE } from "@/lib/auth";
import { fetchAllLeagueStandings, fetchEntry } from "@/lib/fpl/client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { managerId?: unknown; email?: unknown; password?: unknown; confirmPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const managerId = typeof body.managerId === "number" ? body.managerId
    : typeof body.managerId === "string" ? parseInt(body.managerId, 10)
    : NaN;

  const email           = typeof body.email           === "string" ? body.email.trim() || null : null;
  const password        = typeof body.password        === "string" ? body.password        : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (!Number.isFinite(managerId) || managerId <= 0)
    return NextResponse.json({ error: "A valid FPL Manager ID is required" }, { status: 400 });
  if (password.length < 8)
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  if (password !== confirmPassword)
    return NextResponse.json({ error: "Passwords do not match" }, { status: 400 });

  // ── Check if account already exists ──────────────────────────────────────────
  const existingUser = await db.user.findUnique({ where: { managerId } });
  if (existingUser)
    return NextResponse.json({ error: "An account for this Manager ID already exists" }, { status: 409 });

  // ── Validate manager is in the league ────────────────────────────────────────
  const org = await db.organisation.findFirst({ include: { members: true } });
  if (!org)
    return NextResponse.json({ error: "Organisation not configured" }, { status: 503 });

  // First check the Member table (fast path)
  const member = org.members.find((m) => m.managerId === managerId && m.isActive);

  if (!member) {
    // Fallback: check FPL API directly if miniLeagueId is configured
    if (!org.miniLeagueId)
      return NextResponse.json(
        { error: "You are not a member of this organisation's league" },
        { status: 403 }
      );

    try {
      const standings = await fetchAllLeagueStandings(org.miniLeagueId);
      const inLeague  = standings.some((s) => s.entry === managerId);
      if (!inLeague)
        return NextResponse.json(
          { error: "Your FPL Manager ID is not in this organisation's mini-league" },
          { status: 403 }
        );
      // Hydrate member record while we're here
      try {
        const entry = await fetchEntry(managerId);
        await db.member.upsert({
          where:  { managerId },
          create: {
            managerId,
            displayName:    `${entry.player_first_name} ${entry.player_last_name}`.trim(),
            teamName:       entry.name,
            source:         "league",
            isActive:       true,
            organisationId: org.id,
            ...(email ? { email } : {}),
          },
          update: { isActive: true, ...(email ? { email } : {}) },
        });
      } catch {
        // Non-fatal — still allow registration
      }
    } catch {
      return NextResponse.json(
        { error: "Unable to verify league membership — please try again" },
        { status: 503 }
      );
    }
  }

  // ── Create user ───────────────────────────────────────────────────────────────
  const passwordHash = await hashPassword(password);
  await db.user.create({ data: { managerId, passwordHash } });

  // ── Save email on the member record if provided ───────────────────────────────
  if (email) {
    await db.member.updateMany({
      where: { managerId, isActive: true },
      data:  { email },
    });
  }

  // ── Set session cookie ────────────────────────────────────────────────────────
  const token = buildUserToken(managerId);
  const res   = NextResponse.json({ ok: true, managerId }, { status: 201 });
  res.cookies.set(USER_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    path:     "/",
    maxAge:   USER_COOKIE_MAX_AGE,
    secure:   process.env.COOKIE_SECURE === "true",
  });
  return res;
}
