/**
 * Tiny structured logger: one JSON object per line.
 *
 * Why not a library: this file must run unchanged in Node (website, tests)
 * and Deno (Supabase Edge Functions), and must never print personal data.
 * Values under sensitive keys are always replaced with "[redacted]", and
 * phone numbers inside messages are masked.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Keys whose values are never logged (matched case-insensitively, by substring). */
const SENSITIVE_KEY_PARTS = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "transcript",
  "health_note",
  "healthnote",
  "email",
  "phone",
  "to_number",
  "otp",
  "audio",
];

const PHONE_PATTERN = /\+?\d[\d\s-]{8,}\d/g;

export function maskPhone(text: string): string {
  return text.replace(PHONE_PATTERN, (match) => {
    const digits = match.replace(/\D/g, "");
    return digits.length >= 10 ? `***${digits.slice(-3)}` : match;
  });
}

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEY_PARTS.some((part) => k.includes(part));
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[depth-limit]";
  if (typeof value === "string") return maskPhone(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: maskPhone(value.message), stack: value.stack };
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = isSensitiveKey(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export interface LoggerOptions {
  level?: LogLevel;
  /** Where lines go. Defaults to console. Tests pass a collector. */
  sink?: (line: string, level: LogLevel) => void;
  now?: () => Date;
}

export function createLogger(
  bindings: Record<string, unknown> = {},
  options: LoggerOptions = {},
): Logger {
  const minLevel = LEVEL_ORDER[options.level ?? "info"];
  const now = options.now ?? (() => new Date());
  const sink =
    options.sink ??
    ((line: string, level: LogLevel) => {
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
    });

  const write = (level: LogLevel, msg: string, fields?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] < minLevel) return;
    const entry = {
      level,
      time: now().toISOString(),
      msg: maskPhone(msg),
      ...(redact({ ...bindings, ...fields }) as Record<string, unknown>),
    };
    sink(JSON.stringify(entry), level);
  };

  return {
    debug: (msg, fields) => write("debug", msg, fields),
    info: (msg, fields) => write("info", msg, fields),
    warn: (msg, fields) => write("warn", msg, fields),
    error: (msg, fields) => write("error", msg, fields),
    child: (more) => createLogger({ ...bindings, ...more }, options),
  };
}

export const logger = createLogger({ app: "khairiyat" });
