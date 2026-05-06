import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { isAdminRequest } from "@/lib/admin-auth";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { managerId: string } }
) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorised", code: "UNAUTHORISED" }, { status: 401 });
  }
  const managerId = parseInt(params.managerId, 10);
  if (isNaN(managerId)) {
    return NextResponse.json({ error: "Invalid managerId", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  let body: { email?: string | null };
  try {
    body = await req.json() as { email?: string | null };
  } catch {
    return NextResponse.json({ error: "Invalid JSON", code: "VALIDATION_ERROR" }, { status: 400 });
  }

  const email = body.email?.trim() || null;

  try {
    const member = await db.member.findUnique({ where: { managerId } });
    if (!member) {
      return NextResponse.json({ error: "Member not found", code: "MEMBER_NOT_FOUND" }, { status: 404 });
    }
    await db.member.update({ where: { id: member.id }, data: { email } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Database error", code: "DB_ERROR" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { managerId: string } }
) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorised", code: "UNAUTHORISED" }, { status: 401 });
  }
  const managerId = parseInt(params.managerId, 10);
  if (isNaN(managerId)) {
    return NextResponse.json({ error: "Invalid managerId", code: "VALIDATION_ERROR" }, { status: 422 });
  }

  try {
    const member = await db.member.findUnique({ where: { managerId } });
    if (!member) {
      return NextResponse.json({ error: "Member not found", code: "MEMBER_NOT_FOUND" }, { status: 404 });
    }

    await db.member.update({ where: { id: member.id }, data: { isActive: false } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Database error", code: "DB_ERROR" }, { status: 500 });
  }
}
