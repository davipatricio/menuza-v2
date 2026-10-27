import { applyGatewayEventImpl } from "./applyGatewayEvent.impl.ts";

export const paymentsSubdomainRouter = {
  applyGatewayEvent: applyGatewayEventImpl,
};

export type PaymentsSubdomainRouter = typeof paymentsSubdomainRouter;
