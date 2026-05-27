/**
 * Unit tests for the self-signup token branch of src/lib/auth/magic-link.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SelfSignupPayload } from "@/lib/signup/payload";

// Mock the db module. The shared in-memory Map simulates the magic_link_tokens table.
type Row = {
  id: string;
  tokenHash: string;
  purpose: string;
  email: string;
  selfSignupPayload: string | null;
  expiresAt: Date;
  usedAt: Date | null;
  createdFromIp: string | null;
};
const rows = new Map<string, Row>();
let nextId = 1;

vi.mock("@/lib/db", () => ({
  db: {
    magicLinkToken: {
      create: vi.fn(async ({ data }: { data: Partial<Row> }) => {
        const id = `tok-${nextId++}`;
        // Match the real Prisma client's default: columns absent from the
        // insert come back as null, not undefined.
        const row: Row = {
          id,
          tokenHash: data.tokenHash ?? "",
          purpose: data.purpose ?? "",
          email: data.email ?? "",
          selfSignupPayload: data.selfSignupPayload ?? null,
          expiresAt: data.expiresAt ?? new Date(),
          usedAt: null,
          createdFromIp: data.createdFromIp ?? null,
        };
        rows.set(id, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
        for (const row of rows.values()) {
          if (row.tokenHash === where.tokenHash) return row;
        }
        return null;
      }),
      updateMany: vi.fn(
        async ({ where, data }: { where: { id: string; usedAt: null }; data: { usedAt: Date } }) => {
          const row = rows.get(where.id);
          if (!row || row.usedAt !== null) return { count: 0 };
          row.usedAt = data.usedAt;
          return { count: 1 };
        },
      ),
      deleteMany: vi.fn(),
    },
  },
}));

import { issueSelfSignupToken, consumeSelfSignupToken } from "@/lib/auth/magic-link";

const validPayload: SelfSignupPayload = {
  leagueName: "Test League",
  miniLeagueId: 12345,
  fplVerifiedAt: "2026-05-22T10:00:00.000Z",
};

describe("issueSelfSignupToken + consumeSelfSignupToken", () => {
  beforeEach(() => {
    rows.clear();
    nextId = 1;
  });

  it("issues a row with purpose=self_signup and a serialised payload", async () => {
    const issued = await issueSelfSignupToken("a@x.com", validPayload, "127.0.0.1");
    expect(issued.plaintext.length).toBeGreaterThan(0);
    expect(issued.tokenId).toMatch(/^tok-/);
    const row = rows.get(issued.tokenId)!;
    expect(row.purpose).toBe("self_signup");
    expect(row.email).toBe("a@x.com");
    expect(JSON.parse(row.selfSignupPayload!)).toEqual(validPayload);
    expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("returns ok:true with the parsed payload on first consume", async () => {
    const issued = await issueSelfSignupToken("b@x.com", validPayload, null);
    const result = await consumeSelfSignupToken(issued.plaintext);
    if (!result.ok) throw new Error(`Expected ok, got ${result.reason}`);
    expect(result.email).toBe("b@x.com");
    expect(result.payload).toEqual(validPayload);
  });

  it("returns ok:false reason='used' on the second consume of the same token", async () => {
    const issued = await issueSelfSignupToken("c@x.com", validPayload, null);
    const first = await consumeSelfSignupToken(issued.plaintext);
    expect(first.ok).toBe(true);
    const second = await consumeSelfSignupToken(issued.plaintext);
    expect(second).toEqual({ ok: false, reason: "used" });
  });

  it("returns ok:false reason='invalid' for an unknown plaintext", async () => {
    const result = await consumeSelfSignupToken("totally-not-a-real-token");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("returns ok:false reason='invalid' for an empty plaintext", async () => {
    const result = await consumeSelfSignupToken("");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });

  it("returns ok:false reason='expired' when the row has expired", async () => {
    const issued = await issueSelfSignupToken("d@x.com", validPayload, null);
    // Mutate the in-memory row to be expired.
    const row = rows.get(issued.tokenId)!;
    row.expiresAt = new Date(Date.now() - 1000);
    const result = await consumeSelfSignupToken(issued.plaintext);
    expect(result).toEqual({ ok: false, reason: "expired" });
  });

  it("returns ok:false reason='malformed' if the stored payload is corrupted", async () => {
    const issued = await issueSelfSignupToken("e@x.com", validPayload, null);
    const row = rows.get(issued.tokenId)!;
    row.selfSignupPayload = '{"not": "valid"}';
    const result = await consumeSelfSignupToken(issued.plaintext);
    expect(result).toEqual({ ok: false, reason: "malformed" });
  });

  it("returns ok:false reason='invalid' for a token of a different purpose", async () => {
    // Plant a sign_in token directly in the mock store.
    const tokenHash = require("crypto").createHash("sha256").update("plaintext-x").digest("hex");
    rows.set("tok-sign_in", {
      id: "tok-sign_in",
      tokenHash,
      purpose: "sign_in",
      email: "f@x.com",
      selfSignupPayload: null,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      createdFromIp: null,
    });
    const result = await consumeSelfSignupToken("plaintext-x");
    expect(result).toEqual({ ok: false, reason: "invalid" });
  });
});
