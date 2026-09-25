#!/usr/bin/env bun
/**
 * Writes the OpenAPI documents into `apps/orpc-server/openapi/`.
 *
 * Deterministic by construction: it serializes the generator output with a
 * fixed indentation and no timestamps, so regenerating produces no diff.
 * The documents are committed to `apps/orpc-server/openapi/`; a route change
 * without regenerating is a review error.
 *
 * Run with `bun run openapi:generate`.
 */
import { mkdir, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { buildOpenApiDocument, OPENAPI_DOCUMENT_FILES, OPENAPI_SERVICES } from "./document.ts";

const outDir = join(import.meta.dir, "..", "..", "openapi");

await mkdir(outDir, { recursive: true });

for (const service of OPENAPI_SERVICES) {
  const document = await buildOpenApiDocument(service);
  const file = join(outDir, OPENAPI_DOCUMENT_FILES[service]);
  // Write to a temp file and rename so an interrupted run never leaves a
  // truncated document behind (rename is atomic on the same filesystem).
  const tempFile = `${file}.tmp`;
  await writeFile(tempFile, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  await rename(tempFile, file);
  console.log(`[openapi] wrote ${file}`);
}
