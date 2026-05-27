/**
 * Unit tests for src/lib/uat/environment.ts
 * Covers contracts/env-vars.md startup contract.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function loadFresh() {
  const mod = await import("@/lib/uat/environment");
  mod.__resetEnvironmentCacheForTests();
  return mod;
}

describe("environment.ts", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.APP_ENV;
    delete process.env.APP_URL;
    delete process.env.UAT_ALLOWED_EMAILS;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("defaults to development when APP_ENV is unset", async () => {
    const env = await loadFresh();
    expect(env.environmentName()).toBe("development");
    expect(env.isUat()).toBe(false);
  });

  it("recognises APP_ENV=uat", async () => {
    process.env.APP_ENV = "uat";
    const env = await loadFresh();
    expect(env.environmentName()).toBe("uat");
    expect(env.isUat()).toBe(true);
  });

  it("recognises APP_ENV=production", async () => {
    process.env.APP_ENV = "production";
    const env = await loadFresh();
    expect(env.environmentName()).toBe("production");
    expect(env.isUat()).toBe(false);
  });

  it("throws on invalid APP_ENV value", async () => {
    process.env.APP_ENV = "staging";
    const env = await loadFresh();
    expect(() => env.environmentName()).toThrow(/APP_ENV must be one of/);
  });

  it("returns a frozen config object", async () => {
    process.env.APP_ENV = "uat";
    process.env.APP_URL = "http://1.2.3.4/";
    const env = await loadFresh();
    const cfg = env.getEnvironmentConfig();
    expect(cfg.name).toBe("uat");
    expect(cfg.isUat).toBe(true);
    expect(cfg.appUrl).toBe("http://1.2.3.4/");
    expect(Object.isFrozen(cfg)).toBe(true);
  });

  it("caches across calls within the same process state", async () => {
    process.env.APP_ENV = "uat";
    const env = await loadFresh();
    const first = env.getEnvironmentConfig();
    process.env.APP_ENV = "production"; // change after first read
    const second = env.getEnvironmentConfig();
    expect(second).toBe(first); // same frozen instance
    expect(second.name).toBe("uat"); // cached value, not re-read
  });
});
