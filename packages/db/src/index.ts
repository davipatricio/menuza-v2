/**
 * Public surface: types + the singleton client.
 * Server-only: do NOT import from browser code.
 */
export { db, pingDb, disconnectDb, type Db } from "./client.ts";

export type { Contract, Models } from "../prisma/generated/client/contract.ts";
