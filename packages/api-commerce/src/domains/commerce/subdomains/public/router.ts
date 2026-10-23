/**
 * Commerce / public subdomain router. Bundles the storefront reads (MEN-260).
 */
import { getStoreImpl } from "./getStore.impl.ts";
import { getProductImpl } from "./getProduct.impl.ts";
import { listMenuImpl } from "./listMenu.impl.ts";
import { listSitemapImpl } from "./listSitemap.impl.ts";

export const publicSubdomainRouter = {
  getStore: getStoreImpl,
  getProduct: getProductImpl,
  listMenu: listMenuImpl,
  listSitemap: listSitemapImpl,
};
