/**
 * Shared validation helpers built on Zod.
 * Use `parseBody(req, schema)` in every route handler with a JSON body.
 */

import { z, ZodError, type ZodSchema, type ZodTypeAny } from "zod";
import type { NextRequest } from "next/server";

export { z, ZodError };
export type { ZodSchema };

export class ValidationError extends Error {
  constructor(public readonly zodError: ZodError) {
    const issue = zodError.issues[0];
    const path = issue?.path?.join(".") || "input";
    super(`Validation error: ${path}: ${issue?.message ?? "Invalid input"}`);
    this.name = "ValidationError";
  }
}

/**
 * Parse a JSON request body against a Zod schema.
 *
 * Returns the schema's *output* type (`z.infer<S>`), not the input — this
 * matters for schemas that use `.default()` or `.transform()`, where the
 * input type and output type diverge.
 */
export async function parseBody<S extends ZodTypeAny>(req: NextRequest, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ValidationError(
      new ZodError([
        {
          code: "custom",
          path: ["body"],
          message: "Request body is not valid JSON",
        },
      ]),
    );
  }
  return schema.parse(raw);
}

/** Parse search-params against a Zod schema (object form). */
export function parseQuery<S extends ZodTypeAny>(req: NextRequest, schema: S): z.infer<S> {
  const obj = Object.fromEntries(req.nextUrl.searchParams);
  return schema.parse(obj);
}

// ── Common reusable schemas ──────────────────────────────────────────────────

export const emailSchema = z.string().trim().toLowerCase().email();

export const slugSchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens");

export const leagueNameSchema = z.string().trim().min(1).max(80);

export const roleSchema = z.enum(["member", "admin"]);

export const positiveIntSchema = z.coerce.number().int().positive();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
