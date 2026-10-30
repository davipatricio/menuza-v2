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
import { saveProductNutritionImpl } from "./saveProductNutrition.impl.ts";
import { deleteProductImpl } from "./deleteProduct.impl.ts";
import { bulkUpdateProductsImpl } from "./bulkUpdateProducts.impl.ts";
import { bulkDeleteProductsImpl } from "./bulkDeleteProducts.impl.ts";
import { listCategoriesImpl } from "./listCategories.impl.ts";
import { createCategoryImpl } from "./createCategory.impl.ts";
import { updateCategoryImpl } from "./updateCategory.impl.ts";
import { deleteCategoryImpl } from "./deleteCategory.impl.ts";
import { listSubcategoriesImpl } from "./listSubcategories.impl.ts";
import { createSubcategoryImpl } from "./createSubcategory.impl.ts";
import { updateSubcategoryImpl } from "./updateSubcategory.impl.ts";
import { deleteSubcategoryImpl } from "./deleteSubcategory.impl.ts";
import { listDepartmentsImpl } from "./listDepartments.impl.ts";
import { createDepartmentImpl } from "./createDepartment.impl.ts";
import { updateDepartmentImpl } from "./updateDepartment.impl.ts";
import { deleteDepartmentImpl } from "./deleteDepartment.impl.ts";
import { listKitsImpl } from "./listKits.impl.ts";
import { listTagsImpl } from "./listTags.impl.ts";
import { createTagImpl } from "./createTag.impl.ts";
import { updateTagImpl } from "./updateTag.impl.ts";
import { deleteTagImpl } from "./deleteTag.impl.ts";
import { listBadgesImpl } from "./listBadges.impl.ts";
import { createBadgeImpl } from "./createBadge.impl.ts";
import { updateBadgeImpl } from "./updateBadge.impl.ts";
import { deleteBadgeImpl } from "./deleteBadge.impl.ts";
import { createCouponImpl } from "./createCoupon.impl.ts";
import { deleteCouponImpl } from "./deleteCoupon.impl.ts";
import { listCouponsImpl } from "./listCoupons.impl.ts";
import { listCouponSummariesImpl } from "./listCouponSummaries.impl.ts";
import { getCouponDetailImpl } from "./getCouponDetail.impl.ts";
import { updateCouponImpl } from "./updateCoupon.impl.ts";
import { getStoreSeoImpl } from "./getStoreSeo.impl.ts";
import { saveStoreSeoImpl } from "./saveStoreSeo.impl.ts";
import { listSeoEntitiesImpl } from "./listSeoEntities.impl.ts";
import { getSeoImpl } from "./getSeo.impl.ts";
import { saveSeoImpl } from "./saveSeo.impl.ts";
import { revertSeoImpl } from "./revertSeo.impl.ts";
import { getPaymentSettingsImpl } from "./getPaymentSettings.impl.ts";
import { savePaymentIntegrationImpl } from "./savePaymentIntegration.impl.ts";
import { deletePaymentIntegrationImpl } from "./deletePaymentIntegration.impl.ts";
import { savePaymentMethodAssignmentImpl } from "./savePaymentMethodAssignment.impl.ts";
import { listAuditLogsImpl } from "./listAuditLogs.impl.ts";
import { listTeamMembersImpl } from "./listTeamMembers.impl.ts";
import { listIntegrationsImpl } from "./listIntegrations.impl.ts";
import { saveIntegrationImpl } from "./saveIntegration.impl.ts";
import { listMcpSessionsImpl } from "./listMcpSessions.impl.ts";
import { revokeMcpSessionImpl } from "./revokeMcpSession.impl.ts";

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
  saveProductNutrition: saveProductNutritionImpl,
  deleteProduct: deleteProductImpl,
  bulkUpdateProducts: bulkUpdateProductsImpl,
  bulkDeleteProducts: bulkDeleteProductsImpl,
  listCategories: listCategoriesImpl,
  createCategory: createCategoryImpl,
  updateCategory: updateCategoryImpl,
  deleteCategory: deleteCategoryImpl,
  listSubcategories: listSubcategoriesImpl,
  createSubcategory: createSubcategoryImpl,
  updateSubcategory: updateSubcategoryImpl,
  deleteSubcategory: deleteSubcategoryImpl,
  listDepartments: listDepartmentsImpl,
  createDepartment: createDepartmentImpl,
  updateDepartment: updateDepartmentImpl,
  deleteDepartment: deleteDepartmentImpl,
  listKits: listKitsImpl,
  listTags: listTagsImpl,
  createTag: createTagImpl,
  updateTag: updateTagImpl,
  deleteTag: deleteTagImpl,
  listBadges: listBadgesImpl,
  createBadge: createBadgeImpl,
  updateBadge: updateBadgeImpl,
  deleteBadge: deleteBadgeImpl,
  listCoupons: listCouponsImpl,
  listCouponSummaries: listCouponSummariesImpl,
  getCouponDetail: getCouponDetailImpl,
  createCoupon: createCouponImpl,
  updateCoupon: updateCouponImpl,
  deleteCoupon: deleteCouponImpl,
  getStoreSeo: getStoreSeoImpl,
  saveStoreSeo: saveStoreSeoImpl,
  listSeoEntities: listSeoEntitiesImpl,
  getSeo: getSeoImpl,
  saveSeo: saveSeoImpl,
  revertSeo: revertSeoImpl,
  getPaymentSettings: getPaymentSettingsImpl,
  savePaymentIntegration: savePaymentIntegrationImpl,
  deletePaymentIntegration: deletePaymentIntegrationImpl,
  savePaymentMethodAssignment: savePaymentMethodAssignmentImpl,
  listAuditLogs: listAuditLogsImpl,
  listTeamMembers: listTeamMembersImpl,
  listIntegrations: listIntegrationsImpl,
  saveIntegration: saveIntegrationImpl,
  listMcpSessions: listMcpSessionsImpl,
  revokeMcpSession: revokeMcpSessionImpl,
};

export type PanelSubdomainRouter = typeof panelSubdomainRouter;
