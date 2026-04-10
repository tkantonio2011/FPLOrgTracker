import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyPassword, buildUserToken, USER_COOKIE_NAME, USER_COOKIE_MAX_AGE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let body: { managerId?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const managerId = typeof body.managerId === "number" ? body.managerId
    : typeof body.managerId === "string" ? parseInt(body.managerId, 10)
    : NaN;
  const password = typeof body.password === "string" ? body.password : "";

  if (!Number.isFinite(managerId) || managerId <= 0 || !password)
    return NextResponse.json({ error: "Manager ID and password are required" }, { status: 400 });

  const user = await db.user.findUnique({
    where:   { managerId },
    include: { member: { select: { displayName: true, teamName: true, isActive: true } } },
  });

  // Use constant-time comparison even on missing user to prevent timing attacks
  const storedHash = user?.passwordHash ?? "x:x";
  const valid      = await verifyPassword(password, storedHash);

  if (!user || !valid)
    return NextResponse.json({ error: "Invalid Manager ID or password" }, { status: 401 });

  if (!user.member.isActive)
    return NextResponse.json({ error: "Your account has been deactivated" }, { status: 403 });

  await db.user.update({ where: { managerId }, data: { lastLoginAt: new Date() } });

  const token = buildUserToken(managerId);
  const res   = NextResponse.json({
    ok: true,
    managerId,
    displayName: user.member.displayName,
    teamName:    user.member.teamName,
  });
  res.cookies.set(USER_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    path:     "/",
    maxAge:   USER_COOKIE_MAX_AGE,
    secure:   process.env.COOKIE_SECURE === "true",
  });
  return res;
}
