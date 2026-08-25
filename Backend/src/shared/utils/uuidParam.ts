import { z } from "zod";

/**
 * P2-07 (production hardening) — shared UUID-format path-param validator.
 *
 * Verified before adding this: every ID column in schema.prisma uses
 * `@id @default(dbgenerated("gen_random_uuid()"))` with no `@db.Uuid`
 * mapping (Prisma's `String` maps to plain Postgres text/varchar here), so
 * a malformed id today doesn't cause a database type-cast error — it just
 * wastes a round trip and returns a generic "not found" 404. Business
 * identifiers (employeeNo, prNo, ...) are deliberately NOT UUIDs and must
 * never be forced through this — this helper is only for genuine surrogate
 * `id` columns.
 *
 * Rejects an obviously malformed id with a clean 400 before ever reaching
 * the database, and gives a more precise error than a generic "not found."
 */
export function uuidParamSchema<K extends string>(fieldName: K, label: string) {
  return z.object({
    [fieldName]: z.string().uuid(`${label} must be a valid ID.`),
  } as Record<K, z.ZodString>);
}
