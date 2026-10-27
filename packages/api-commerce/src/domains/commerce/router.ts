/**
 * Commerce domain router. Aggregates subdomain implementations.
 */
import { healthImpl } from "./subdomains/public/health.impl.ts";
import { ordersSubdomainRouter } from "./subdomains/orders/router.ts";
import { paymentsSubdomainRouter } from "./subdomains/payments/router.ts";
import { publicSubdomainRouter } from "./subdomains/public/router.ts";
import { walletSubdomainRouter } from "./subdomains/wallet/router.ts";

export const commerceDomainRouter = {
  health: healthImpl,
  public: publicSubdomainRouter,
  orders: ordersSubdomainRouter,
  wallet: walletSubdomainRouter,
  payments: paymentsSubdomainRouter,
};
