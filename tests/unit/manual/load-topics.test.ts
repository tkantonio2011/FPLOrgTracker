import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadTopics, ManifestError, stripBodyForSearch } from "@/lib/manual/load-topics";

let scratch: string;

function writeTopic(rel: string, frontmatter: Record<string, unknown>, body = "Hello"): void {
  const full = join(scratch, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  const yaml =
    "---\n" +
    Object.entries(frontmatter)
      .map(([k, v]) => `${k}: ${typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v)}`)
      .join("\n") +
    "\n---\n" +
    body;
  writeFileSync(full, yaml, "utf-8");
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "manual-loader-"));
});

afterEach(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe("loadTopics — happy path", () => {
  it("loads a single valid topic", () => {
    writeTopic("00-getting-started/01-welcome.mdx", {
      title: "Welcome",
      audience: "both",
      summary: "Introduction to the platform.",
      lastUpdated: "2026-05-18",
    });
    const topics = loadTopics(scratch);
    expect(topics).toHaveLength(1);
    expect(topics[0]!.slug).toBe("welcome");
    expect(topics[0]!.sectionId).toBe("getting-started");
    expect(topics[0]!.frontmatter.title).toBe("Welcome");
  });

  it("derives order from filename numeric prefix", () => {
    writeTopic("00-getting-started/03-third.mdx", {
      title: "Third", audience: "both", summary: "x", lastUpdated: "2026-05-18",
    });
    writeTopic("00-getting-started/01-first.mdx", {
      title: "First", audience: "both", summary: "x", lastUpdated: "2026-05-18",
    });
    const topics = loadTopics(scratch);
    const ordered = topics.slice().sort((a, b) => a.order - b.order);
    expect(ordered[0]!.slug).toBe("first");
    expect(ordered[1]!.slug).toBe("third");
  });

  it("honours frontmatter slug override", () => {
    writeTopic("00-x/01-default-slug.mdx", {
      title: "X", audience: "both", summary: "x", lastUpdated: "2026-05-18", slug: "custom-slug",
    });
    const topics = loadTopics(scratch);
    expect(topics[0]!.slug).toBe("custom-slug");
  });
});

describe("loadTopics — validation failures", () => {
  it("rejects missing title", () => {
    writeTopic("00-x/01-a.mdx", {
      audience: "both", summary: "x", lastUpdated: "2026-05-18",
    });
    expect(() => loadTopics(scratch)).toThrow(ManifestError);
    expect(() => loadTopics(scratch)).toThrow(/title must be 1.80/);
  });

  it("rejects title over 80 chars", () => {
    writeTopic("00-x/01-a.mdx", {
      title: "x".repeat(81), audience: "both", summary: "x", lastUpdated: "2026-05-18",
    });
    expect(() => loadTopics(scratch)).toThrow(/title must be/);
  });

  it("rejects invalid audience", () => {
    writeTopic("00-x/01-a.mdx", {
      title: "X", audience: "everyone", summary: "x", lastUpdated: "2026-05-18",
    });
    expect(() => loadTopics(scratch)).toThrow(/audience must be one of/);
  });

  it("rejects summary over 200 chars", () => {
    writeTopic("00-x/01-a.mdx", {
      title: "X", audience: "both", summary: "x".repeat(201), lastUpdated: "2026-05-18",
    });
    expect(() => loadTopics(scratch)).toThrow(/summary must be/);
  });

  it("rejects malformed lastUpdated", () => {
    writeTopic("00-x/01-a.mdx", {
      title: "X", audience: "both", summary: "x", lastUpdated: "2026/05/18",
    });
    expect(() => loadTopics(scratch)).toThrow(/lastUpdated must be YYYY-MM-DD/);
  });

  it("rejects future-dated lastUpdated", () => {
    const past = new Date("2026-05-18");
    writeTopic("00-x/01-a.mdx", {
      title: "X", audience: "both", summary: "x", lastUpdated: "2030-01-01",
    });
    expect(() => loadTopics(scratch, past)).toThrow(/lastUpdated must not be in the future/);
  });

  it("rejects malformed slug override", () => {
    writeTopic("00-x/01-a.mdx", {
      title: "X", audience: "both", summary: "x", lastUpdated: "2026-05-18", slug: "Has Spaces",
    });
    expect(() => loadTopics(scratch)).toThrow(/slug must be/);
  });

  it("rejects slug collision within a section", () => {
    writeTopic("00-x/01-dup.mdx", {
      title: "First", audience: "both", summary: "x", lastUpdated: "2026-05-18",
    });
    writeTopic("00-x/02-dup.mdx", {
      title: "Second", audience: "both", summary: "x", lastUpdated: "2026-05-18", slug: "dup",
    });
    expect(() => loadTopics(scratch)).toThrow(/collides with/);
  });
});

describe("loadTopics — tolerance", () => {
  it("ignores unknown frontmatter fields", () => {
    writeTopic("00-x/01-a.mdx", {
      title: "X", audience: "both", summary: "x", lastUpdated: "2026-05-18",
      experimentalField: "value",
    });
    expect(() => loadTopics(scratch)).not.toThrow();
  });

  it("returns an empty array when content directory is empty", () => {
    const topics = loadTopics(scratch);
    expect(topics).toEqual([]);
  });

  it("returns an empty array when content directory does not exist", () => {
    const topics = loadTopics(join(scratch, "nope"));
    expect(topics).toEqual([]);
  });
});

describe("stripBodyForSearch", () => {
  it("strips JSX tags", () => {
    expect(stripBodyForSearch("Hello <AnnotatedImage src=\"x\" /> world")).toMatch(/Hello\s+world/);
  });

  it("strips markdown link syntax but keeps the visible text", () => {
    expect(stripBodyForSearch("See [the docs](https://example.com)")).toContain("the docs");
    expect(stripBodyForSearch("See [the docs](https://example.com)")).not.toContain("example.com");
  });

  it("strips fenced code blocks", () => {
    const input = "Before\n```js\nconst x = 1;\n```\nAfter";
    expect(stripBodyForSearch(input)).not.toContain("const x = 1");
  });

  it("collapses whitespace", () => {
    expect(stripBodyForSearch("a\n\n\nb")).toBe("a b");
  });

  it("strips emphasis markers", () => {
    expect(stripBodyForSearch("This is *important* and **very** so")).toBe("This is important and very so");
  });
});
