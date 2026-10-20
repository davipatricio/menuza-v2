/**
 * Commerce / orders subdomain router. Bundles the order lifecycle (MEN-93,
 * MEN-95, MEN-96).
 *
 * `expire` is worker-facing: it carries the internal-token gate and no session,
 * while the rest resolve the caller from the commerce session.
 */
import { createOrderImpl } from "./create.impl.ts";
import { expireOrderImpl } from "./expire.impl.ts";
import { getOrderImpl } from "./get.impl.ts";
import { recordOrderPaymentImpl } from "./recordPayment.impl.ts";
import { transitionOrderImpl } from "./transition.impl.ts";

export const ordersSubdomainRouter = {
  create: createOrderImpl,
  get: getOrderImpl,
  transition: transitionOrderImpl,
  recordPayment: recordOrderPaymentImpl,
  expire: expireOrderImpl,
};
