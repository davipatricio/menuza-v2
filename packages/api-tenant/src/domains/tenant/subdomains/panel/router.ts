import { getStoreImpl } from "./getStore.impl.ts";
import { createStoreImpl } from "./createStore.impl.ts";
import { listOrdersImpl } from "./listOrders.impl.ts";
import { getOrderImpl } from "./getOrder.impl.ts";
import { getOrderTransitionsImpl } from "./getOrderTransitions.impl.ts";
import { transitionOrderImpl } from "./transitionOrder.impl.ts";
import { recordOrderPaymentImpl } from "./recordOrderPayment.impl.ts";
import { listCustomersImpl } from "./listCustomers.impl.ts";
import { getCustomerImpl } from "./getCustomer.impl.ts";
import { listProductsImpl } from "./listProducts.impl.ts";
import { getProductImpl } from "./getProduct.impl.ts";
import { createProductImpl } from "./createProduct.impl.ts";
import { updateProductImpl } from "./updateProduct.impl.ts";
import { deleteProductImpl } from "./deleteProduct.impl.ts";
import { bulkUpdateProductsImpl } from "./bulkUpdateProducts.impl.ts";
import { bulkDeleteProductsImpl } from "./bulkDeleteProducts.impl.ts";
import { listCategoriesImpl } from "./listCategories.impl.ts";
import { createCategoryImpl } from "./createCategory.impl.ts";
import { updateCategoryImpl } from "./updateCategory.impl.ts";
import { deleteCategoryImpl } from "./deleteCategory.impl.ts";
import { listDepartmentsImpl } from "./listDepartments.impl.ts";
import { createDepartmentImpl } from "./createDepartment.impl.ts";
import { updateDepartmentImpl } from "./updateDepartment.impl.ts";
import { deleteDepartmentImpl } from "./deleteDepartment.impl.ts";
import { listKitsImpl } from "./listKits.impl.ts";
import { listTagsImpl } from "./listTags.impl.ts";
import { createTagImpl } from "./createTag.impl.ts";
import { updateTagImpl } from "./updateTag.impl.ts";
import { deleteTagImpl } from "./deleteTag.impl.ts";
import { createCouponImpl } from "./createCoupon.impl.ts";
import { deleteCouponImpl } from "./deleteCoupon.impl.ts";
import { listCouponsImpl } from "./listCoupons.impl.ts";
import { updateCouponImpl } from "./updateCoupon.impl.ts";
import { getStoreSeoImpl } from "./getStoreSeo.impl.ts";
import { saveStoreSeoImpl } from "./saveStoreSeo.impl.ts";
import { listSeoEntitiesImpl } from "./listSeoEntities.impl.ts";
import { getSeoImpl } from "./getSeo.impl.ts";
import { saveSeoImpl } from "./saveSeo.impl.ts";
import { revertSeoImpl } from "./revertSeo.impl.ts";
import { listAuditLogsImpl } from "./listAuditLogs.impl.ts";
import { listTeamMembersImpl } from "./listTeamMembers.impl.ts";

export const panelSubdomainRouter = {
  getStore: getStoreImpl,
  createStore: createStoreImpl,
  listOrders: listOrdersImpl,
  getOrder: getOrderImpl,
  getOrderTransitions: getOrderTransitionsImpl,
  transitionOrder: transitionOrderImpl,
  recordOrderPayment: recordOrderPaymentImpl,
  listCustomers: listCustomersImpl,
  getCustomer: getCustomerImpl,
  listProducts: listProductsImpl,
  getProduct: getProductImpl,
  createProduct: createProductImpl,
  updateProduct: updateProductImpl,
  deleteProduct: deleteProductImpl,
  bulkUpdateProducts: bulkUpdateProductsImpl,
  bulkDeleteProducts: bulkDeleteProductsImpl,
  listCategories: listCategoriesImpl,
  createCategory: createCategoryImpl,
  updateCategory: updateCategoryImpl,
  deleteCategory: deleteCategoryImpl,
  listDepartments: listDepartmentsImpl,
  createDepartment: createDepartmentImpl,
  updateDepartment: updateDepartmentImpl,
  deleteDepartment: deleteDepartmentImpl,
  listKits: listKitsImpl,
  listTags: listTagsImpl,
  createTag: createTagImpl,
  updateTag: updateTagImpl,
  deleteTag: deleteTagImpl,
  listCoupons: listCouponsImpl,
  createCoupon: createCouponImpl,
  updateCoupon: updateCouponImpl,
  deleteCoupon: deleteCouponImpl,
  getStoreSeo: getStoreSeoImpl,
  saveStoreSeo: saveStoreSeoImpl,
  listSeoEntities: listSeoEntitiesImpl,
  getSeo: getSeoImpl,
  saveSeo: saveSeoImpl,
  revertSeo: revertSeoImpl,
  listAuditLogs: listAuditLogsImpl,
  listTeamMembers: listTeamMembersImpl,
};

export type PanelSubdomainRouter = typeof panelSubdomainRouter;
