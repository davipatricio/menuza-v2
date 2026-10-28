#!/usr/bin/env bun
/**
 * Register an OAuth client for the admin MCP server.
 *
 *   bun run --filter '@menuza/tenant' oauth:client <clientId> <redirectUri...>
 *
 * Registration is an operator action on purpose: a client's redirect URIs are
 * the only places its authorization codes may be delivered, so no HTTP endpoint
 * creates one. Re-running with an existing id is a no-op — it does not widen
 * the registered URIs, because that would let a typo silently rebind a client
 * to someone else's callback.
 */
import { exit } from "node:process";
import { registerOAuthClient } from "@menuza/orpc-server/auth";

const [clientId, ...redirectUris] = process.argv.slice(2);

if (!clientId || redirectUris.length === 0) {
  console.error("usage: bun run oauth:client <clientId> <redirectUri...>");
  exit(1);
}

for (const uri of redirectUris) {
  try {
    new URL(uri);
  } catch {
    console.error(`not a URL: ${uri}`);
    exit(1);
  }
}

const client = await registerOAuthClient({ clientId, redirectUris });

console.log(
  JSON.stringify(
    { clientId: client?.clientId, name: client?.name, redirectUris: client?.redirectUris },
    null,
    2,
  ),
);

// The db pool would otherwise keep the process alive; this is one query.
exit(0);
