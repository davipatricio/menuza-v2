/**
 * Commerce domain router. Aggregates subdomain implementations.
 */
import { healthImpl } from "./subdomains/public/health.impl.ts";

export const commerceDomainRouter = {
  health: healthImpl,
};
