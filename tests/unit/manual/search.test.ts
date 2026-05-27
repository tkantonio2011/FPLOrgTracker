import { describe, it, expect, vi } from "vitest";

// The search module imports the build-time JSON index via a "@/content/manual/search-index.json"
// path. Mock that import with a deterministic fixture so the ranker is testable independently of content.
vi.mock("@/content/manual/search-index.json", () => ({
  default: [
    {
      slug: "standings",
      path: "/help/reading-the-app/standings",
      title: "Reading the Standings page",
      audience: "member",
      sectionId: "reading-the-app",
      sectionTitle: "Reading the App",
      summary: "How the leaderboard works and what the rank-change arrows mean.",
      body: "Standings is the canonical leaderboard. Rank change arrows. Relegation zone styling.",
    },
    {
      slug: "magic-link",
      path: "/help/getting-started/magic-link",
      title: "Signing in with a magic-link",
      audience: "both",
      sectionId: "getting-started",
      sectionTitle: "Getting Started",
      summary: "How the email-based sign-in works.",
      body: "Enter your email at the sign-in page. We email you a link valid for 15 minutes. Click it to sign in.",
    },
    {
      slug: "weekly-digest",
      path: "/help/league-admin/weekly-digest",
      title: "Sending the weekly digest",
      audience: "admin",
      sectionId: "league-admin",
      sectionTitle: "League Admin",
      summary: "Trigger a GW-summary email to every member with a configured address.",
      body: "The digest summarises the gameweek winner, loser, captain choices and bench waste.",
    },
  ],
}));

import { searchManual, popularTopics, getSearchIndex } from "@/lib/manual/search";

describe("searchManual", () => {
  it("returns empty array for queries under 2 chars", () => {
    expect(searchManual("")).toEqual([]);
    expect(searchManual("a")).toEqual([]);
    expect(searchManual("  ")).toEqual([]);
  });

  it("matches by title — exact title term outranks body-only matches", () => {
    const out = searchManual("standings");
    expect(out.length).toBeGreaterThan(0);
    expect(out[0]!.entry.slug).toBe("standings");
  });

  it("matches by summary terms", () => {
    const out = searchManual("rank change");
    expect(out[0]!.entry.slug).toBe("standings");
  });

  it("matches by body when the term doesn't appear in title or summary", () => {
    const out = searchManual("relegation");
    expect(out.find((r) => r.entry.slug === "standings")).toBeDefined();
  });

  it("matches multi-word queries", () => {
    const out = searchManual("magic link");
    expect(out[0]!.entry.slug).toBe("magic-link");
  });

  it("returns an empty list for nonsense queries (caller renders popular fallback)", () => {
    const out = searchManual("xqzwflarg");
    expect(out).toEqual([]);
  });

  it("returns scored results sorted best-first", () => {
    const out = searchManual("digest");
    expect(out[0]!.entry.slug).toBe("weekly-digest");
    // Score is between 0 (perfect) and 1 (worst); sorted ascending.
    for (let i = 1; i < out.length; i++) {
      expect(out[i]!.score).toBeGreaterThanOrEqual(out[i - 1]!.score);
    }
  });
});

describe("popularTopics", () => {
  it("returns the first N entries in their natural manifest order", () => {
    const out = popularTopics(2);
    expect(out).toHaveLength(2);
    expect(out[0]!.slug).toBe("standings");
    expect(out[1]!.slug).toBe("magic-link");
  });

  it("defaults to 5 entries", () => {
    const out = popularTopics();
    expect(out.length).toBeLessThanOrEqual(5);
  });
});

describe("getSearchIndex", () => {
  it("exposes the underlying entries (used by the no-results fallback)", () => {
    expect(getSearchIndex().length).toBe(3);
  });
});
