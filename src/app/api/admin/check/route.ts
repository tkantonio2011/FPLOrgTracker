import { NextRequest, NextResponse } from "next/server";
import { isAdminRequest, isPinConfigured } from "@/lib/admin-auth";

export async function GET(req: NextRequest) {
  return NextResponse.json({
    authenticated: isAdminRequest(req),
    pinRequired: isPinConfigured(),
  });
}
