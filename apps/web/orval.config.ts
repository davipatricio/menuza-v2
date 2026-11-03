import { defineConfig } from "orval";

export default defineConfig({
  commerce: {
    input: {
      target: "../../crates/openapi/commerce.json",
      override: { transformer: "./orval.transformer.mjs" },
    },
    output: {
      target: "src/lib/api/commerce.ts",
      schemas: "src/lib/api/model",
      client: "fetch",
      mode: "single",
      baseUrl: "/commerce",
      mock: false,
      prettier: false,
      override: {
        operationName: (operation) => {
          switch (operation.operationId) {
            case "getCommerceHealth":
              return "health";
            case "listPublicMenu":
              return "listMenu";
            case "getPublicProduct":
              return "getProduct";
            case "listPublicSitemap":
              return "listSitemap";
            case "getPublicStore":
              return "getStore";
            default:
              return operation.operationId ?? "";
          }
        },
      },
    },
  },
  tenant: {
    input: {
      target: "../../crates/openapi/tenant.json",
      override: { transformer: "./orval.transformer.mjs" },
    },
    output: {
      target: "src/lib/api/tenant.ts",
      schemas: "src/lib/api/model",
      client: "fetch",
      mode: "single",
      baseUrl: "/tenant",
      mock: false,
      prettier: false,
    },
  },
});
