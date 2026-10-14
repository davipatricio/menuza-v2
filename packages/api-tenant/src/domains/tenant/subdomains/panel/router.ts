import { getStoreImpl } from "./getStore.impl.ts";
import { createStoreImpl } from "./createStore.impl.ts";
import { listOrdersImpl } from "./listOrders.impl.ts";
import { getOrderImpl } from "./getOrder.impl.ts";
import { listCustomersImpl } from "./listCustomers.impl.ts";
import { getCustomerImpl } from "./getCustomer.impl.ts";
import { listProductsImpl } from "./listProducts.impl.ts";
import { listCategoriesImpl } from "./listCategories.impl.ts";
import { listDepartmentsImpl } from "./listDepartments.impl.ts";
import { listKitsImpl } from "./listKits.impl.ts";
import { listTagsImpl } from "./listTags.impl.ts";
import { createCouponImpl } from "./createCoupon.impl.ts";
import { deleteCouponImpl } from "./deleteCoupon.impl.ts";
import { listCouponsImpl } from "./listCoupons.impl.ts";
import { updateCouponImpl } from "./updateCoupon.impl.ts";
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
  listDepartments: listDepartmentsImpl,
  listKits: listKitsImpl,
  listTags: listTagsImpl,
  listCoupons: listCouponsImpl,
  createCoupon: createCouponImpl,
  updateCoupon: updateCouponImpl,
  deleteCoupon: deleteCouponImpl,
  listAuditLogs: listAuditLogsImpl,
  listTeamMembers: listTeamMembersImpl,
};

export type PanelSubdomainRouter = typeof panelSubdomainRouter;
