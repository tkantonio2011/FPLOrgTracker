/**
 * Standard API response envelope used by every server-side handler.
 * See contracts/auth-contracts.md for the canonical shape.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthzError } from "@/lib/authz/errors";

export interface ApiMeta {
  total: number;
  page: number;
  limit: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: ApiMeta;
}

/** Successful response. */
export function ok<T>(
  data: T,
  init?: { meta?: ApiMeta; status?: number; headers?: Record<string, string> },
): NextResponse<ApiResponse<T>> {
  const body: ApiResponse<T> = { success: true, data };
  if (init?.meta) body.meta = init.meta;
  return NextResponse.json(body, { status: init?.status ?? 200, headers: init?.headers });
}

/** Generic failure response. */
export function fail(error: string, status = 400): NextResponse<ApiResponse<never>> {
  return NextResponse.json<ApiResponse<never>>({ success: false, error }, { status });
}

/** Convert a ZodError into the standard envelope. */
export function failValidation(err: ZodError): NextResponse<ApiResponse<never>> {
  const issue = err.issues[0];
  const path = issue?.path?.join(".") || "input";
  const message = issue?.message ?? "Invalid input";
  return fail(`Validation error: ${path}: ${message}`, 400);
}

/**
 * Convert any thrown error into the appropriate envelope response.
 * Use in route handlers as: `catch (err) { return failFromError(err); }`
 */
export function failFromError(err: unknown): NextResponse<ApiResponse<never>> {
  if (err instanceof ZodError) return failValidation(err);
  if (err instanceof AuthzError) return fail(err.message, err.status);
  if (err instanceof Error) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("[api] unhandled error:", err);
    }
    return fail("Internal server error", 500);
  }
  return fail("Internal server error", 500);
}
