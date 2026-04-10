import { NextResponse } from "next/server";
import { USER_COOKIE_NAME } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(USER_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    path:     "/",
    maxAge:   0,
  });
  return res;
}
