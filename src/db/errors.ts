/**
 * Helpers to understand Postgres errors (drizzle wraps the driver error
 * in "Failed query: …" and keeps the original as `cause`).
 */
interface PgLikeError {
  code?: string;
  message?: string;
  cause?: unknown;
}

function chain(error: unknown): PgLikeError[] {
  const out: PgLikeError[] = [];
  let current: unknown = error;
  for (let i = 0; i < 5 && current && typeof current === "object"; i++) {
    out.push(current as PgLikeError);
    current = (current as PgLikeError).cause;
  }
  return out;
}

/** The innermost database error message (e.g. our guard trigger text). */
export function dbErrorMessage(error: unknown): string {
  const messages = chain(error)
    .map((e) => e.message)
    .filter((m): m is string => typeof m === "string");
  return messages.at(-1) ?? String(error);
}

export function dbErrorCode(error: unknown): string | undefined {
  return chain(error).find((e) => typeof e.code === "string")?.code;
}

/** 23505 = unique_violation: "this already exists", which is how idempotency shows up. */
export function isUniqueViolation(error: unknown): boolean {
  return dbErrorCode(error) === "23505";
}

/** P0001 = raise_exception: one of our guard triggers refused the change. */
export function isGuardViolation(error: unknown): boolean {
  return dbErrorCode(error) === "P0001" || dbErrorMessage(error).startsWith("guard:");
}
