/**
 * Unit tests for src/lib/fpl/verify-mini-league.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyFplMiniLeague } from "@/lib/fpl/verify-mini-league";

const originalFetch = global.fetch;

function mockFetchResponse(body: unknown, opts: { status?: number; ok?: boolean } = {}): Response {
  const status = opts.status ?? 200;
  return {
    ok: opts.ok ?? (status >= 200 && status < 300),
    status,
    json: async () => body,
  } as unknown as Response;
}

describe("verifyFplMiniLeague", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns { kind: 'verified', name } on a 200 with a valid body", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ league: { name: "The Sunday Crew" } }),
    ) as unknown as typeof fetch;

    const result = await verifyFplMiniLeague(12345);
    expect(result).toEqual({ kind: "verified", name: "The Sunday Crew" });
  });

  it("returns { kind: 'no_such_league' } on 404", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse({ detail: "Not found." }, { status: 404 }),
    ) as unknown as typeof fetch;

    const result = await verifyFplMiniLeague(99999999);
    expect(result).toEqual({ kind: "no_such_league" });
  });

  it("returns { kind: 'inconclusive', reason: 'network' } on a non-OK non-404 status", async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockFetchResponse({}, { status: 502 }),
    ) as unknown as typeof fetch;

    const result = await verifyFplMiniLeague(12345);
    expect(result).toEqual({ kind: "inconclusive", reason: "network" });
  });

  it("returns { kind: 'inconclusive', reason: 'network' } when fetch itself throws (non-abort)", async () => {
    global.fetch = vi
      .fn()
      .mockRejectedValue(new TypeError("fetch failed")) as unknown as typeof fetch;

    const result = await verifyFplMiniLeague(12345);
    expect(result).toEqual({ kind: "inconclusive", reason: "network" });
  });

  it("returns { kind: 'inconclusive', reason: 'malformed' } when the body is missing league.name", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockFetchResponse({ league: {} })) as unknown as typeof fetch;

    const result = await verifyFplMiniLeague(12345);
    expect(result).toEqual({ kind: "inconclusive", reason: "malformed" });
  });

  it("returns { kind: 'inconclusive', reason: 'timeout' } when the fetch is aborted", async () => {
    // Simulate the AbortController firing: the fetch mock rejects with an
    // AbortError synchronously when called with the aborted signal.
    global.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as unknown as typeof fetch;

    const result = await verifyFplMiniLeague(12345, { timeoutMs: 10 });
    expect(result).toEqual({ kind: "inconclusive", reason: "timeout" });
  });
});
