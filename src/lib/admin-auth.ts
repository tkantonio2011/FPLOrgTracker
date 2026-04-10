import { createHmac } from "crypto";
import type { NextRequest } from "next/server";

const COOKIE_NAME = "admin_token";

// Derive a session token from the configured PIN.
// If the PIN changes, all existing cookies are automatically invalidated.
function computeToken(): string {
  const pin = process.env.ADMIN_PIN ?? "";
  return createHmac("sha256", "fpl-admin-session").update(pin).digest("hex");
}

/** Returns true if a PIN has been configured. */
export function isPinConfigured(): boolean {
  return Boolean(process.env.ADMIN_PIN);
}

/** Checks the submitted PIN against the configured one. */
export function verifyPin(pin: string): boolean {
  if (!process.env.ADMIN_PIN) return true; // No PIN set → open access
  return pin.trim() === process.env.ADMIN_PIN.trim();
}

/** Returns the token that should be stored in the session cookie. */
export function buildAdminToken(): string {
  return computeToken();
}

/**
 * Returns true if the incoming request carries a valid admin session cookie,
 * or if no ADMIN_PIN has been configured (open access mode).
 */
export function isAdminRequest(req: NextRequest): boolean {
  if (!process.env.ADMIN_PIN) return true;
  const token = req.cookies.get(COOKIE_NAME)?.value;
  return token === computeToken();
}

export const ADMIN_COOKIE_NAME = COOKIE_NAME;
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours
