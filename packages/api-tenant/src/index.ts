export { tenantDomainRouter } from "./domains/tenant/router.ts";

// The panel's role rule, reused by the MCP server so a role it does not
// recognize is the least-privileged one there too, not the most.
export { canonicalRole } from "./domains/tenant/subdomains/session/support.ts";

// The implementations the MCP tool catalog delegates to. Exported as the
// router object so the MCP side names procedures exactly as the dashboard
// does, and a rename breaks the build instead of a tool call at runtime.
export { panelSubdomainRouter } from "./domains/tenant/subdomains/panel/router.ts";
