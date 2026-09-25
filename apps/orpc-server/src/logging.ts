/**
 * Tiny structured logger. JSON lines to stdout.
 * Redacts Authorization and Cookie headers; never logs request bodies.
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Header map consumed by `redactHeaders`. Keys are raw header names. */
export interface HeaderMap {
  readonly [name: string]: string | undefined;
}

export type RedactedHeaderMap = { [name: string]: string };

/** Log payload: JSON-serializable primitives plus redacted header maps. */
export type LogValue = string | number | boolean | null | undefined | RedactedHeaderMap;

/** Known header names for redaction checks. */
const SENSITIVE_HEADERS = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-menuza-internal-token",
] as const;

type SensitiveHeader = (typeof SENSITIVE_HEADERS)[number];

const SENSITIVE_HEADER_SET: ReadonlySet<SensitiveHeader> = new Set(SENSITIVE_HEADERS);

/** Header names `redactHeaders` accepts: the sensitive names plus any other name. */
export type RedactableHeader = SensitiveHeader | (string & {});

export function redactHeaders(headers: HeaderMap): RedactedHeaderMap {
  const redacted = buildRedactedHeaders(headers);

  return redacted;
}

/** Named redaction result: one entry per input header, sensitive values masked. */
export interface RedactedHeaders {
  [name: string]: string;
}

/** Copy `headers`, replacing the values of the sensitive names. */
function buildRedactedHeaders(headers: HeaderMap): RedactedHeaders {
  const out: RedactedHeaders = {};

  for (const [k, v] of Object.entries(headers)) {
    // SAFETY: the membership check runs against the closed
    // `SENSITIVE_HEADERS` tuple. Only the known sensitive header names are
    // ever redacted; all other names pass through as-is.
    const sensitive = SENSITIVE_HEADER_SET.has(k.toLowerCase() as SensitiveHeader);

    out[k] = sensitive ? "<redacted>" : (v ?? "");
  }

  return out;
}

export interface LogFields {
  requestId: string;
  level?: LogLevel;
  msg: string;
  readonly [key: string]: LogValue;
}

export function log(fields: LogFields): void {
  const { level = "info", ...rest } = fields;
  console.log(JSON.stringify({ ts: new Date().toISOString(), level, ...rest }));
}

export function newRequestId(): string {
  return crypto.randomUUID();
}
