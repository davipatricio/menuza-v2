import { definePrismaConfig } from "prisma/config";
import { defineConfig as definePostgresConfig } from "@prisma/orm-postgres/config";

export default definePrismaConfig({
  orm: definePostgresConfig({
    contract: "./prisma/contract.prisma",
    output: "./prisma/generated/client",
    db: {
      connection: process.env.DATABASE_URL,
    },
  }),
});
