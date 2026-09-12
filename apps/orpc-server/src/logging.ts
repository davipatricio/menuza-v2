/**
 * Tiny structured logger. JSON lines to stdout.
 * Redacts Authorization and Cookie headers; never logs request bodies.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

const REDACT_KEYS = new Set(["authorization", "cookie", "set-cookie"]);

export function redactHeaders(headers: Record<string, string | undefined>): Record<string, string> {
  const out: Record<string, string> = {};

  for (const [k, v] of Object.entries(headers)) {
    out[k] = REDACT_KEYS.has(k.toLowerCase()) ? "<redacted>" : (v ?? "");
  }

  return out;
}

export interface LogFields {
  requestId: string;
  level?: LogLevel;
  msg: string;
  [k: string]: unknown;
}

export function log(fields: LogFields): void {
  const { level = "info", ...rest } = fields;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, ...rest }));
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
