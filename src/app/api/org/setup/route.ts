import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchEntry } from "@/lib/fpl/client";
import { isAdminRequest } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) {
    return NextResponse.json({ error: "Unauthorised", code: "UNAUTHORISED" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { name, miniLeagueId, digestPrompt } = body as { name?: string; miniLeagueId?: number; digestPrompt?: string | null };

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Organisation name is required", code: "VALIDATION_ERROR" }, { status: 422 });
    }

    const existing = await db.organisation.findFirst();

    const data = {
      name: name.trim(),
      miniLeagueId: miniLeagueId ?? null,
      digestPrompt: digestPrompt !== undefined ? (digestPrompt?.trim() || null) : undefined,
    };

    const org = existing
      ? await db.organisation.update({ where: { id: existing.id }, data })
      : await db.organisation.create({ data: { ...data, digestPrompt: data.digestPrompt ?? null } });

    return NextResponse.json({ id: org.id, name: org.name, miniLeagueId: org.miniLeagueId, digestPrompt: org.digestPrompt ?? null }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Setup failed", code: "SETUP_ERROR" }, { status: 500 });
  }
}
