// Prisma v7 config: datasource URL + schema location.
// Prisma CLI loads .env automatically; Bun also loads it for runtime scripts.
// See: https://www.prisma.io/docs/orm/reference/prisma-config-reference
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations",
    seed: "bun run prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
