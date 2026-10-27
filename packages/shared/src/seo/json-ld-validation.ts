/**
 * JSON-LD syntax and shape checks (browser-safe, pure).
 *
 * Two jobs, deliberately apart:
 *
 * - **Syntax** is an error. The editor marks the offending line, the save button
 *   stays disabled and the server refuses the block on its own.
 * - **Shape** is a warning. A missing `@type` or a `Product` without `offers` is
 *   legal JSON that search engines simply ignore, so it never blocks a save.
 *
 * The position comes from a small JSON scanner instead of the host engine's
 * message: V8 says "at position N", SpiderMonkey says "at line L column C" and
 * JavaScriptCore says nothing at all, and the panel has to point at the same
 * line everywhere. The scanner only runs after `JSON.parse` already failed, so
 * it can never turn a valid document into an error.
 */
import * as v from "valibot";
import {
  JsonLdDocumentSchema,
  toJsonLdDocument,
  type JsonLdDocument,
  type JsonLdNode,
  type JsonLdOffer,
} from "./json-ld.ts";

export interface JsonLdParseError {
  message: string;
  /** Zero-based offset of the offending character. */
  offset: number;
  /** One-based line of the offset. */
  line: number;
  /** One-based column of the offset. */
  column: number;
}

/** A line and a column, 1-based. */
interface JsonLdPosition {
  line: number;
  column: number;
}

export type JsonLdIssueSeverity = "error" | "warning";

export interface JsonLdIssue {
  severity: JsonLdIssueSeverity;
  /** JSON path of the offending field, e.g. `$.offers.lowPrice`. */
  path: string;
  message: string;
}

export interface JsonLdAnalysis {
  /** The block already read, or `null` when there is nothing to read. */
  document: JsonLdDocument | null;
  error: JsonLdParseError | null;
  issues: JsonLdIssue[];
}

export type JsonLdParseResult =
  | { ok: true; document: JsonLdDocument }
  | { ok: false; error: JsonLdParseError };

const MAX_ISSUES = 8;

/**
 * Reads a JSON-LD block. The returned error carries the position of the first
 * offending character so the editor can point at it.
 */
export function parseJsonLd(source: string): JsonLdParseResult {
  let decoded;

  try {
    decoded = v.parse(JsonLdDocumentSchema, JSON.parse(source));
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { ok: false, error: toParseError(source, error.message) };
    }

    // Valid JSON that is not a block we understand: it parses, it just has no
    // field we can read. The shape warnings say so.
    return { ok: true, document: { nodes: [], context: null } };
  }

  return { ok: true, document: toJsonLdDocument(decoded) };
}

/**
 * Reads a JSON-LD block and reports what is wrong with it: the syntax error
 * when it does not parse, the shape warnings when it does. An empty field is
 * not an error — the entity simply inherits.
 */
export function analyzeJsonLd(source: string | null): JsonLdAnalysis {
  if (source === null || source.trim() === "") {
    return { document: null, error: null, issues: [] };
  }

  const parsed = parseJsonLd(source);

  if (!parsed.ok) {
    return {
      document: null,
      error: parsed.error,
      issues: [
        {
          severity: "error",
          path: "",
          message: `Linha ${parsed.error.line}, coluna ${parsed.error.column}: ${parsed.error.message}`,
        },
      ],
    };
  }

  const issues = parsed.document.nodes.flatMap((node, index) =>
    checkNode(node, index === 0 ? "$" : `$[${index}]`),
  );

  if (parsed.document.nodes.length === 0) {
    issues.push(warning("$", "O bloco não segue o formato esperado do Schema.org."));
  }

  return { document: parsed.document, error: null, issues: dedupe(issues).slice(0, MAX_ISSUES) };
}

/** The block reindented, for the preview to show what the page publishes. */
export function formatJsonLd(source: string): string {
  try {
    return JSON.stringify(JSON.parse(source), null, 2);
  } catch {
    return source;
  }
}

// --- Syntax ------------------------------------------------------------------

function toParseError(source: string, message: string): JsonLdParseError {
  const offset = errorOffset(source, message);

  const { line, column } = lineColumn(source, offset);

  return { message: cleanMessage(message), offset, line, column };
}

/** The offset of the first offending character, from the scanner or the message. */
function errorOffset(source: string, message: string): number {
  const scanned = scanJson(source);

  if (!scanned.ok) return scanned.offset;

  const position = /position (\d+)/.exec(message);

  if (position) return Number(position[1]);

  const line = /line (\d+)/.exec(message);
  const column = /column (\d+)/.exec(message);

  if (line && column) return offsetFromLineColumn(source, Number(line[1]), Number(column[1]));

  return 0;
}

/** The engine message carries its own "at position N"; the panel shows the rest. */
function cleanMessage(message: string): string {
  return message
    .replace(/^JSON\.parse:\s*/, "")
    .replace(/\s*in JSON at position \d+.*$/, "")
    .replace(/\s*at position \d+.*$/, "")
    .replace(/\s*of the JSON data$/, "")
    .trim();
}

/** One-based line and column of an offset, counting `\r\n` as one break. */
function lineColumn(source: string, offset: number): JsonLdPosition {
  const safeOffset = Math.max(0, Math.min(offset, source.length));

  let line = 1;
  let lineStart = 0;

  for (let index = 0; index < safeOffset; index += 1) {
    if (source[index] !== "\n") continue;

    line += 1;
    lineStart = index + 1;
  }

  return { line, column: safeOffset - lineStart + 1 };
}

function offsetFromLineColumn(source: string, line: number, column: number): number {
  let current = 1;
  let index = 0;

  while (current < line && index < source.length) {
    if (source[index] === "\n") current += 1;

    index += 1;
  }

  return Math.min(index + Math.max(0, column - 1), source.length);
}

// --- The scanner -------------------------------------------------------------

type ScanResult = { ok: true } | { ok: false; offset: number };

/**
 * A minimal JSON reader that reports where a document stops making sense.
 * It is a locator, not a parser: the value always comes from `JSON.parse`.
 */
function scanJson(source: string): ScanResult {
  let index = 0;

  const isDigit = (char: string | undefined) => char !== undefined && char >= "0" && char <= "9";

  const skipWhitespace = () => {
    while (index < source.length) {
      const char = source[index];

      if (char === " " || char === "\t" || char === "\n" || char === "\r") index += 1;
      else break;
    }
  };

  const scanString = (): ScanResult => {
    const start = index;

    index += 1;

    while (index < source.length) {
      const char = source[index];

      if (char === '"') {
        index += 1;

        return { ok: true };
      }

      if (char === "\\") {
        index += 2;

        continue;
      }

      if (source.charCodeAt(index) < 0x20) return { ok: false, offset: index };

      index += 1;
    }

    return { ok: false, offset: start };
  };

  const scanNumber = (): ScanResult => {
    const start = index;

    if (source[index] === "-") index += 1;

    if (source[index] === "0") {
      index += 1;
    } else if (isDigit(source[index])) {
      while (isDigit(source[index])) index += 1;
    } else {
      return { ok: false, offset: start };
    }

    if (source[index] === ".") {
      index += 1;

      const fractionStart = index;

      while (isDigit(source[index])) index += 1;

      if (index === fractionStart) return { ok: false, offset: index };
    }

    if (source[index] === "e" || source[index] === "E") {
      index += 1;

      if (source[index] === "+" || source[index] === "-") index += 1;

      const exponentStart = index;

      while (isDigit(source[index])) index += 1;

      if (index === exponentStart) return { ok: false, offset: index };
    }

    return { ok: true };
  };

  const scanValue = (depth: number): ScanResult => {
    if (depth > 100) return { ok: false, offset: index };

    skipWhitespace();

    const char = source[index];

    if (char === undefined) return { ok: false, offset: index };

    if (char === '"') return scanString();

    if (char === "{") return scanObject(depth);

    if (char === "[") return scanArray(depth);

    if (source.startsWith("true", index)) {
      index += 4;

      return { ok: true };
    }

    if (source.startsWith("false", index)) {
      index += 5;

      return { ok: true };
    }

    if (source.startsWith("null", index)) {
      index += 4;

      return { ok: true };
    }

    return scanNumber();
  };

  const scanObject = (depth: number): ScanResult => {
    index += 1;

    skipWhitespace();

    if (source[index] === "}") {
      index += 1;

      return { ok: true };
    }

    for (;;) {
      skipWhitespace();

      if (source[index] !== '"') return { ok: false, offset: index };

      const key = scanString();

      if (!key.ok) return key;

      skipWhitespace();

      if (source[index] !== ":") return { ok: false, offset: index };

      index += 1;

      const value = scanValue(depth + 1);

      if (!value.ok) return value;

      skipWhitespace();

      if (source[index] === ",") {
        index += 1;

        continue;
      }

      if (source[index] === "}") {
        index += 1;

        return { ok: true };
      }

      return { ok: false, offset: index };
    }
  };

  const scanArray = (depth: number): ScanResult => {
    index += 1;

    skipWhitespace();

    if (source[index] === "]") {
      index += 1;

      return { ok: true };
    }

    for (;;) {
      const value = scanValue(depth + 1);

      if (!value.ok) return value;

      skipWhitespace();

      if (source[index] === ",") {
        index += 1;

        continue;
      }

      if (source[index] === "]") {
        index += 1;

        return { ok: true };
      }

      return { ok: false, offset: index };
    }
  };

  const document = scanValue(0);

  if (!document.ok) return document;

  skipWhitespace();

  if (index < source.length) return { ok: false, offset: index };

  return { ok: true };
}

// --- Shape -------------------------------------------------------------------

/** The types a node declares: `@type` can be one name or a list. */
function nodeTypes(node: JsonLdNode): string[] {
  const type = node["@type"];

  if (type === undefined) return [];

  return Array.isArray(type) ? type : [type];
}

function checkNode(node: JsonLdNode, path: string): JsonLdIssue[] {
  const issues: JsonLdIssue[] = [];

  const context = node["@context"];

  if (context === undefined) {
    issues.push(warning(path, "Falta `@context`. Use `https://schema.org`."));
  } else if (!context.includes("schema.org")) {
    issues.push(warning(`${path}.@context`, "`@context` não aponta para `https://schema.org`."));
  }

  const types = nodeTypes(node);

  if (types.length === 0) {
    issues.push(warning(`${path}.@type`, "Falta `@type`. Use `Product`, `Store` ou outro tipo."));
  }

  for (const type of types) {
    if (type === "Product") issues.push(...checkProduct(node, path));

    if (type === "Store") issues.push(...checkStore(node, path));

    if (type === "Offer" || type === "AggregateOffer") {
      issues.push(...checkOffer(node, path, type));
    }
  }

  return issues;
}

function checkProduct(node: JsonLdNode, path: string): JsonLdIssue[] {
  const issues: JsonLdIssue[] = [];

  if (!hasText(node.name)) issues.push(warning(path, "Falta `name` — o nome do produto."));

  if (!hasText(node.url)) {
    issues.push(warning(path, "Falta `url` — o endereço da página do produto."));
  }

  if (!hasImage(node.image)) {
    issues.push(warning(path, "Falta `image` — a busca usa a imagem do produto."));
  }

  const offers = node.offers;

  if (offers === undefined) {
    issues.push(warning(path, "Falta `offers` — é o que mostra o preço no resultado da busca."));
  } else if (Array.isArray(offers)) {
    const first = offers[0];

    if (first !== undefined) issues.push(...checkOfferFields(first, `${path}.offers[0]`));
  } else {
    issues.push(...checkOfferFields(offers, `${path}.offers`));
  }

  return issues;
}

function checkStore(node: JsonLdNode, path: string): JsonLdIssue[] {
  const issues: JsonLdIssue[] = [];

  if (!hasText(node.name)) issues.push(warning(path, "Falta `name` — o nome da loja."));

  if (!hasText(node.url)) issues.push(warning(path, "Falta `url` — o endereço da loja."));

  return issues;
}

function checkOffer(
  node: JsonLdNode,
  path: string,
  type: "Offer" | "AggregateOffer",
): JsonLdIssue[] {
  const offer = node.offers;

  if (offer === undefined || Array.isArray(offer)) return [];

  return checkOfferFields(offer, `${path}.offers`, type);
}

function checkOfferFields(
  offer: JsonLdOffer,
  path: string,
  type: "Offer" | "AggregateOffer" = offerType(offer),
): JsonLdIssue[] {
  const issues: JsonLdIssue[] = [];

  if (!hasText(offer.priceCurrency)) {
    issues.push(warning(`${path}.priceCurrency`, "Falta `priceCurrency` — use `BRL`."));
  }

  if (type === "AggregateOffer") {
    if (!hasText(offer.lowPrice)) {
      issues.push(warning(`${path}.lowPrice`, "Falta `lowPrice` — o menor preço."));
    }
  } else if (!hasText(offer.price)) {
    issues.push(warning(`${path}.price`, "Falta `price` — o preço da oferta."));
  }

  return issues;
}

/** An offer without its own type is read as the aggregate one, the common case. */
function offerType(offer: JsonLdOffer): "Offer" | "AggregateOffer" {
  return offer["@type"] === "Offer" ? "Offer" : "AggregateOffer";
}

function hasText(value: string | undefined): boolean {
  return value !== undefined && value.trim() !== "";
}

/** A imagem pode ser uma URL ou uma lista delas; as duas valem. */
function hasImage(value: string | string[] | undefined): boolean {
  if (value === undefined) return false;

  return Array.isArray(value) ? value.length > 0 : value.trim() !== "";
}

function warning(path: string, message: string): JsonLdIssue {
  return { severity: "warning", path, message };
}

function dedupe(issues: JsonLdIssue[]): JsonLdIssue[] {
  const seen = new Set<string>();

  return issues.filter((issue) => {
    const key = `${issue.path}|${issue.message}`;

    if (seen.has(key)) return false;

    seen.add(key);

    return true;
  });
}
