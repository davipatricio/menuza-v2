import { getStoreImpl } from "./getStore.impl.ts";
import { createStoreImpl } from "./createStore.impl.ts";
import { listOrdersImpl } from "./listOrders.impl.ts";
import { getOrderImpl } from "./getOrder.impl.ts";
import { listCustomersImpl } from "./listCustomers.impl.ts";
import { getCustomerImpl } from "./getCustomer.impl.ts";
import { listProductsImpl } from "./listProducts.impl.ts";
import { listCategoriesImpl } from "./listCategories.impl.ts";
import { listCouponsImpl } from "./listCoupons.impl.ts";
import { listAuditLogsImpl } from "./listAuditLogs.impl.ts";
import { listTeamMembersImpl } from "./listTeamMembers.impl.ts";

export const panelSubdomainRouter = {
  getStore: getStoreImpl,
  createStore: createStoreImpl,
  listOrders: listOrdersImpl,
  getOrder: getOrderImpl,
  listCustomers: listCustomersImpl,
  getCustomer: getCustomerImpl,
  listProducts: listProductsImpl,
  listCategories: listCategoriesImpl,
  listCoupons: listCouponsImpl,
  listAuditLogs: listAuditLogsImpl,
  listTeamMembers: listTeamMembersImpl,
};

export type PanelSubdomainRouter = typeof panelSubdomainRouter;
