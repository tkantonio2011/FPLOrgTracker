import { describe, it, expect } from "vitest";
import { safeReturnPath, prettyNameForPath } from "@/lib/manual/return-path";

describe("safeReturnPath", () => {
  it("returns '/' for null/undefined/empty input", () => {
    expect(safeReturnPath(null)).toBe("/");
    expect(safeReturnPath(undefined)).toBe("/");
    expect(safeReturnPath("")).toBe("/");
  });

  it("returns valid relative paths as-is", () => {
    expect(safeReturnPath("/standings")).toBe("/standings");
    expect(safeReturnPath("/l/foo/standings")).toBe("/l/foo/standings");
    expect(safeReturnPath("/leagues")).toBe("/leagues");
  });

  it("decodes URL-encoded paths", () => {
    expect(safeReturnPath("%2Fl%2Ffoo%2Fstandings")).toBe("/l/foo/standings");
    expect(safeReturnPath("%2Fleagues")).toBe("/leagues");
  });

  it("rejects protocol-relative URLs", () => {
    expect(safeReturnPath("//evil.example")).toBe("/");
    expect(safeReturnPath("//attacker/path")).toBe("/");
  });

  it("rejects absolute URLs", () => {
    expect(safeReturnPath("https://evil.example")).toBe("/");
    expect(safeReturnPath("http://evil/path")).toBe("/");
    expect(safeReturnPath("javascript:alert(1)")).toBe("/");
  });

  it("rejects backslash and colon in the path", () => {
    expect(safeReturnPath("/path\\..\\windows")).toBe("/");
    expect(safeReturnPath("/path:with:colons")).toBe("/");
  });

  it("rejects control characters", () => {
    expect(safeReturnPath("/path\x00null")).toBe("/");
    expect(safeReturnPath("/path\nnewline")).toBe("/");
    expect(safeReturnPath("/path\rcarriage")).toBe("/");
  });

  it("rejects paths over 1024 chars", () => {
    const huge = "/" + "a".repeat(2000);
    expect(safeReturnPath(huge)).toBe("/");
  });

  it("rejects invalid URL encoding", () => {
    expect(safeReturnPath("%E0%A4%A")).toBe("/"); // truncated UTF-8
    expect(safeReturnPath("%ZZ")).toBe("/");
  });

  it("requires path to start with /", () => {
    expect(safeReturnPath("leagues")).toBe("/");
    expect(safeReturnPath("../etc/passwd")).toBe("/");
  });
});

describe("prettyNameForPath", () => {
  it("maps known league sub-pages to friendly names", () => {
    expect(prettyNameForPath("/l/sandsharks/standings")).toBe("Standings");
    expect(prettyNameForPath("/l/sandsharks/live")).toBe("Live Points");
    expect(prettyNameForPath("/l/sandsharks/captain-whatif")).toBe("Captain What-If");
    expect(prettyNameForPath("/l/sandsharks/wall-of-shame")).toBe("Wall of Shame");
  });

  it("maps platform-scoped pages", () => {
    expect(prettyNameForPath("/leagues")).toBe("Leagues");
    expect(prettyNameForPath("/my-admin")).toBe("My admin leagues");
    expect(prettyNameForPath("/platform")).toBe("Platform");
  });

  it("maps the admin sub-shell", () => {
    expect(prettyNameForPath("/l/sandsharks/admin")).toBe("Admin");
    expect(prettyNameForPath("/l/sandsharks/admin/members")).toBe("Admin");
  });

  it("falls back to 'where you were' for unknown paths", () => {
    expect(prettyNameForPath("/")).toBe("where you were");
    expect(prettyNameForPath("/l/foo/unrecognised")).toBe("where you were");
    expect(prettyNameForPath("/some/random/path")).toBe("where you were");
  });

  it("strips query string before matching", () => {
    expect(prettyNameForPath("/l/foo/standings?gw=10")).toBe("Standings");
  });
});
