// Prisma ORM 8 config: contract path, generated output, CLI database connection.
// The CLI does not read .env by itself; load the repo-root .env when needed.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { definePrismaConfig } from "prisma/config";
import { defineConfig as definePostgresConfig } from "@prisma/orm-postgres/config";

const rootEnv = fileURLToPath(new URL("../../.env", import.meta.url));

if (!process.env.DATABASE_URL && existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

export default definePrismaConfig({
  orm: definePostgresConfig({
    contract: "./prisma/contract.prisma",
    output: "./prisma/generated/client",
    db: {
      connection: process.env.DATABASE_URL,
    },
  }),
});
