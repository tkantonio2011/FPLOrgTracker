# Contract: UAT allow-list format

**Feature**: 004-uat-deployment
**Date**: 2026-05-21

This is the parsing and matching contract for `UAT_ALLOWED_EMAILS`. It is consumed by `src/lib/uat/allowlist.ts` and exercised by the magic-link / invitation routes when `isUat()` is true.

---

## Wire format

A single environment variable, value is a string:

```
UAT_ALLOWED_EMAILS="alice@example.com, bob@example.com,  carol@example.com"
```

- **Separator**: comma. Only comma. No semicolons, no newlines.
- **Whitespace**: trimmed around each entry.
- **Case**: every entry is lowercased before storing.
- **Empty entries**: an empty entry (caused by a trailing comma or `,,`) is **rejected** at parse time — it's almost always a typo, and silently dropping it would mask the typo.

---

## Parsing rules (in order)

1. Trim leading/trailing whitespace from the raw string.
2. Split on `,` into raw entries.
3. For each raw entry:
   1. `trim()` whitespace.
   2. Reject if empty → error: `"UAT_ALLOWED_EMAILS contains an empty entry"`.
   3. `toLowerCase()`.
   4. Validate against `z.string().email()`. Reject if invalid → error names the offending entry.
4. Deduplicate (already-lowercased so equality is exact).
5. Wrap in `Object.freeze(new Set(entries))`.

**Errors are aggregated**: a malformed value such as `"alice@x.com, not-an-email, , bob@y.com"` produces one combined error message listing every problem, not just the first. Implementation: collect errors into an array; if non-empty after the loop, `throw new Error(errors.join("\n"))`.

---

## Lookup rules

The single exported function from `src/lib/uat/allowlist.ts`:

```typescript
export function isEmailAllowed(email: string): boolean
```

Behaviour:
- `email.trim().toLowerCase()` — same canonical form as parsing.
- `return allowList.has(canonical);`
- Throws if called when `APP_ENV !== "uat"` (programming error — production code paths must not consult the allow-list).

---

## Invariants (asserted by unit tests)

1. **Empty input refused.** `UAT_ALLOWED_EMAILS=""` ⇒ startup error. (`UAT_ALLOWED_EMAILS` *unset* is also a startup error when `APP_ENV=uat`.)
2. **Whitespace tolerant.** `"  alice@x.com  ,bob@y.com"` parses cleanly.
3. **Case-insensitive match.** `"Alice@X.com"` in env matches a request body of `"alice@x.com"` and vice versa.
4. **Trailing comma rejected.** `"alice@x.com,"` ⇒ startup error.
5. **Internal whitespace inside an email rejected.** `"al ice@x.com"` ⇒ startup error.
6. **Deduplicated.** `"alice@x.com, ALICE@X.COM"` parses to a 1-element set.
7. **No wildcards.** `"@example.com"` ⇒ startup error (fails `z.string().email()`).
8. **Frozen.** Mutating attempts on the exported set throw.

---

## Contract test sketch (Vitest)

```typescript
import { describe, it, expect, beforeEach } from "vitest";

describe("UAT allow-list parser", () => {
  beforeEach(() => { delete process.env.UAT_ALLOWED_EMAILS; });

  it("parses a clean list", async () => {
    process.env.UAT_ALLOWED_EMAILS = "alice@x.com,bob@y.com";
    const { isEmailAllowed } = await import("@/lib/uat/allowlist");
    expect(isEmailAllowed("alice@x.com")).toBe(true);
    expect(isEmailAllowed("eve@z.com")).toBe(false);
  });

  it("is case-insensitive", async () => {
    process.env.UAT_ALLOWED_EMAILS = "Alice@X.com";
    const { isEmailAllowed } = await import("@/lib/uat/allowlist");
    expect(isEmailAllowed("alice@x.com")).toBe(true);
  });

  it("rejects empty entries", async () => {
    process.env.UAT_ALLOWED_EMAILS = "alice@x.com, , bob@y.com";
    await expect(import("@/lib/uat/allowlist")).rejects.toThrow(/empty entry/);
  });

  it("rejects malformed addresses with a combined error", async () => {
    process.env.UAT_ALLOWED_EMAILS = "alice@x.com, not-an-email, also-bad";
    await expect(import("@/lib/uat/allowlist")).rejects.toThrow(/not-an-email[\s\S]*also-bad/);
  });
});
```

(Each test does `vi.resetModules()` between cases — omitted for brevity.)
