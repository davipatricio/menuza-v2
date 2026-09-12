/**
 * Singleton Prisma client with the PostgreSQL driver adapter.
 * Connection lifecycle: ONE process-wide client. Use $disconnect on shutdown.
 */
import { PrismaClient } from "../prisma/generated/client/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is required");
}

declare global {
  // eslint-disable-next-line no-var
  var __menuzaPrisma: PrismaClient | undefined;
}

const adapter = new PrismaPg({ connectionString: url });

export const prisma: PrismaClient = globalThis.__menuzaPrisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalThis.__menuzaPrisma = prisma;
}

export async function disconnectDb(): Promise<void> {
  await prisma.$disconnect();
}
