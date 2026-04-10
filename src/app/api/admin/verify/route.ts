import { NextRequest, NextResponse } from "next/server";
import {
  verifyPin,
  buildAdminToken,
  ADMIN_COOKIE_NAME,
  ADMIN_COOKIE_MAX_AGE,
} from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { pin?: string };

  if (!verifyPin(body.pin ?? "")) {
    return NextResponse.json(
      { error: "Incorrect PIN", code: "INVALID_PIN" },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ ok: true });
  // Only mark the cookie secure if the request itself came in over HTTPS.
  // On plain HTTP (e.g. EC2 without SSL), secure:true would cause the browser
  // to set the cookie but never send it back, breaking every subsequent request.
  const isHttps = req.headers.get("x-forwarded-proto") === "https" ||
                  req.nextUrl.protocol === "https:";

  res.cookies.set(ADMIN_COOKIE_NAME, buildAdminToken(), {
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_COOKIE_MAX_AGE,
    secure: isHttps,
  });
  return res;
}
