/**
 * Unit tests for src/lib/signup/slug.ts.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module so we control whether a slug is "taken".
const findUniqueLeagueMock = vi.fn();
const findUniqueHistoryMock = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    league: { findUnique: (...args: unknown[]) => findUniqueLeagueMock(...args) },
    leagueSlugHistory: {
      findUnique: (...args: unknown[]) => findUniqueHistoryMock(...args),
    },
  },
}));

import { slugify, resolveAvailableSlug } from "@/lib/signup/slug";

describe("slugify", () => {
  it("kebab-cases a plain ASCII name", () => {
    expect(slugify("The Sunday Crew")).toBe("the-sunday-crew");
  });

  it("strips combining diacritics via NFKD", () => {
    expect(slugify("Café Soccer")).toBe("cafe-soccer");
  });

  it("collapses runs of non-alphanumerics into a single hyphen", () => {
    expect(slugify("FFootball   League!! #1")).toBe("ffootball-league-1");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("---hello---")).toBe("hello");
  });

  it("caps the result at 60 characters", () => {
    const long = "a".repeat(100);
    const out = slugify(long);
    expect(out.length).toBeLessThanOrEqual(60);
  });

  it("returns an empty string for input that maps to nothing", () => {
    expect(slugify("???")).toBe("");
  });
});

describe("resolveAvailableSlug", () => {
  beforeEach(() => {
    findUniqueLeagueMock.mockReset();
    findUniqueHistoryMock.mockReset();
    findUniqueLeagueMock.mockResolvedValue(null);
    findUniqueHistoryMock.mockResolvedValue(null);
  });

  it("returns the base slug when it's free", async () => {
    const out = await resolveAvailableSlug("the-sunday-crew");
    expect(out).toBe("the-sunday-crew");
  });

  it("appends -2 when the base slug is taken in `leagues`", async () => {
    findUniqueLeagueMock.mockImplementation(({ where }: { where: { slug: string } }) =>
      Promise.resolve(where.slug === "the-sunday-crew" ? { id: "x" } : null),
    );
    const out = await resolveAvailableSlug("the-sunday-crew");
    expect(out).toBe("the-sunday-crew-2");
  });

  it("appends -2 when the base is taken in `league_slug_history` only", async () => {
    findUniqueHistoryMock.mockImplementation(({ where }: { where: { slug: string } }) =>
      Promise.resolve(where.slug === "the-sunday-crew" ? { id: "h" } : null),
    );
    const out = await resolveAvailableSlug("the-sunday-crew");
    expect(out).toBe("the-sunday-crew-2");
  });

  it("walks past -2 to -3 when both are taken", async () => {
    findUniqueLeagueMock.mockImplementation(({ where }: { where: { slug: string } }) =>
      Promise.resolve(
        ["the-sunday-crew", "the-sunday-crew-2"].includes(where.slug) ? { id: "x" } : null,
      ),
    );
    const out = await resolveAvailableSlug("the-sunday-crew");
    expect(out).toBe("the-sunday-crew-3");
  });

  it("defaults an empty base to 'league'", async () => {
    const out = await resolveAvailableSlug("");
    expect(out).toBe("league");
  });

  it("throws when every suffix up to 999 is taken", async () => {
    // All slugs read as taken.
    findUniqueLeagueMock.mockResolvedValue({ id: "x" });
    await expect(resolveAvailableSlug("dense")).rejects.toThrow(/1000 attempts/);
  });
});
