/**
 * Commerce / wallet subdomain router. Bundles the customer wallet (MEN-92).
 */
import { adjustWalletImpl } from "./adjust.impl.ts";
import { getWalletImpl } from "./get.impl.ts";

export const walletSubdomainRouter = {
  get: getWalletImpl,
  adjust: adjustWalletImpl,
};
