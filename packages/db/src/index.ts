/**
 * Public surface: types + the singleton client.
 * Server-only: do NOT import from browser code.
 */
export { prisma, disconnectDb } from "./client.ts";

export type { Tenant, Domain, Prisma } from "../prisma/generated/client/client.ts";
