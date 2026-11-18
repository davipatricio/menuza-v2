import { defineConfig } from "orval";

export default defineConfig({
  commerce: {
    input: {
      target: "../../crates/openapi/commerce.json",
      override: { transformer: "./orval.transformer.mjs" },
    },
    output: {
      target: "src/commerce.ts",
      schemas: "src/model",
      client: "fetch",
      mode: "single",
      baseUrl: "/commerce",
      mock: false,
      override: {
        mutator: { path: "./src/http.ts", name: "apiFetch" },
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
      target: "src/tenant.ts",
      schemas: "src/model",
      client: "fetch",
      mode: "single",
      baseUrl: "/tenant",
      mock: false,
      override: {
        mutator: { path: "./src/http.ts", name: "apiFetch" },
      },
    },
  },
});
