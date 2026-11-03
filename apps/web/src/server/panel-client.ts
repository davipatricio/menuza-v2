/**
 * Server-side tenant client for the dashboard.
 *
 * Runs in Start server functions and loaders and calls the tenant REST surface
 * on the loopback service (`TENANT_INTERNAL_URL`), forwarding the incoming
 * `menuza_tenant_sid` cookie. The generated fetchers in `src/lib/api/tenant.ts`
 * build browser-relative URLs, so — as in `server-api.ts` — this module pairs
 * their URL builders with a server-side `fetch` against the absolute origin. No
 * shared client state across requests.
 */
import { getRequest } from "@tanstack/react-start/server";
import type { RouterContractClient } from "@orpc/contract";
import type { tenantContractObject } from "@menuza/shared/tenant";
import {
  getBulkDeletePanelCouponsUrl,
  getBulkDeletePanelProductsUrl,
  getBulkUpdatePanelProductsUrl,
  getChangeAccountPasswordUrl,
  getCreatePanelBadgeUrl,
  getCreatePanelCategoryUrl,
  getCreatePanelCouponUrl,
  getCreatePanelDepartmentUrl,
  getCreatePanelProductUrl,
  getCreatePanelStoreUrl,
  getCreatePanelSubcategoryUrl,
  getCreatePanelTagUrl,
  getDeletePanelBadgeUrl,
  getDeletePanelCategoryUrl,
  getDeletePanelCouponUrl,
  getDeletePanelDepartmentUrl,
  getDeletePanelPaymentIntegrationUrl,
  getDeletePanelProductUrl,
  getDeletePanelSubcategoryUrl,
  getDeletePanelTagUrl,
  getGetPanelCouponDetailUrl,
  getGetPanelCustomerUrl,
  getGetPanelOrderTransitionsUrl,
  getGetPanelOrderUrl,
  getGetPanelPaymentSettingsUrl,
  getGetPanelProductUrl,
  getGetPanelSeoUrl,
  getGetPanelStoreSeoUrl,
  getGetPanelStoreUrl,
  getGetTenantSessionUrl,
  getListAccountSessionsUrl,
  getListPanelAuditLogsUrl,
  getListPanelBadgesUrl,
  getListPanelCategoriesUrl,
  getListPanelCouponSummariesUrl,
  getListPanelCouponsUrl,
  getListPanelCustomersUrl,
  getListPanelDepartmentsUrl,
  getListPanelIntegrationsUrl,
  getListPanelKitsUrl,
  getListPanelMcpSessionsUrl,
  getListPanelOrdersUrl,
  getListPanelProductsUrl,
  getListPanelSeoEntitiesUrl,
  getListPanelSubcategoriesUrl,
  getListPanelTagsUrl,
  getListPanelTeamMembersUrl,
  getLoginTenantSessionUrl,
  getLogoutTenantSessionUrl,
  getRecordPanelOrderPaymentUrl,
  getRegisterTenantAccountUrl,
  getRevertPanelSeoUrl,
  getRevokeAccountSessionUrl,
  getRevokeOtherAccountSessionsUrl,
  getRevokePanelMcpSessionUrl,
  getSavePanelIntegrationUrl,
  getSavePanelPaymentIntegrationUrl,
  getSavePanelPaymentMethodAssignmentUrl,
  getSavePanelProductNutritionUrl,
  getSavePanelSeoUrl,
  getSavePanelStoreSeoUrl,
  getSearchPanelUrl,
  getSetPanelCouponStatusUrl,
  getTransitionPanelOrderUrl,
  getUpdatePanelBadgeUrl,
  getUpdatePanelCategoryUrl,
  getUpdatePanelCouponUrl,
  getUpdatePanelDepartmentUrl,
  getUpdatePanelProductUrl,
  getUpdatePanelSubcategoryUrl,
  getUpdatePanelTagUrl,
} from "@/lib/api/tenant.ts";
import { ApiError } from "@/lib/api-error";

const TENANT_SESSION_COOKIE = "menuza_tenant_sid";

type ContractClient = RouterContractClient<typeof tenantContractObject>;

/**
 * The procedures this file serves, typed from the oRPC contract so callers keep
 * the input and output types they already use.
 */
export type TenantClient = {
  session: Pick<ContractClient["session"], "login" | "logout" | "current" | "register">;
  account: Pick<
    ContractClient["account"],
    "listSessions" | "changePassword" | "revokeSession" | "revokeOtherSessions"
  >;
  panel: Pick<
    ContractClient["panel"],
    | "getStore"
    | "createStore"
    | "listOrders"
    | "getOrder"
    | "getOrderTransitions"
    | "transitionOrder"
    | "recordOrderPayment"
    | "listCustomers"
    | "getCustomer"
    | "listProducts"
    | "getProduct"
    | "createProduct"
    | "updateProduct"
    | "saveProductNutrition"
    | "deleteProduct"
    | "bulkUpdateProducts"
    | "bulkDeleteProducts"
    | "listCategories"
    | "createCategory"
    | "updateCategory"
    | "deleteCategory"
    | "listSubcategories"
    | "createSubcategory"
    | "updateSubcategory"
    | "deleteSubcategory"
    | "listDepartments"
    | "createDepartment"
    | "updateDepartment"
    | "deleteDepartment"
    | "listTags"
    | "createTag"
    | "updateTag"
    | "deleteTag"
    | "listBadges"
    | "createBadge"
    | "updateBadge"
    | "deleteBadge"
    | "listKits"
    | "listCoupons"
    | "listCouponSummaries"
    | "getCouponDetail"
    | "createCoupon"
    | "updateCoupon"
    | "deleteCoupon"
    | "setCouponStatus"
    | "bulkDeleteCoupons"
    | "getStoreSeo"
    | "saveStoreSeo"
    | "listSeoEntities"
    | "getSeo"
    | "saveSeo"
    | "revertSeo"
    | "getPaymentSettings"
    | "savePaymentIntegration"
    | "deletePaymentIntegration"
    | "savePaymentMethodAssignment"
    | "listIntegrations"
    | "saveIntegration"
    | "listMcpSessions"
    | "revokeMcpSession"
    | "listAuditLogs"
    | "listTeamMembers"
    | "search"
  >;
};

/** The dashboard session payload, derived from `session.current`'s contract output. */
export type PanelSession = Awaited<ReturnType<TenantClient["session"]["current"]>>;

/** Reads one cookie out of the raw `cookie` header; no cookie library needed here. */
function readSessionCookie(header: string | null): string {
  if (!header) return "";

  const prefix = `${TENANT_SESSION_COOKIE}=`;

  for (const pair of header.split(";")) {
    const entry = pair.trim();

    if (entry.startsWith(prefix)) return entry.slice(prefix.length).trim();
  }

  return "";
}

/** What the REST route answers, typed from the contract method that documents it. */
type PanelResult<K extends keyof TenantClient["panel"]> = Awaited<
  ReturnType<TenantClient["panel"][K]>
>;

type AccountResult<K extends keyof TenantClient["account"]> = Awaited<
  ReturnType<TenantClient["account"][K]>
>;

type SessionResult<K extends keyof TenantClient["session"]> = Awaited<
  ReturnType<TenantClient["session"][K]>
>;

/** Maps an API status to the code callers switch on; anything else is a failure. */
function statusError(status: number): Error {
  const message = `tenant ${status}`;

  switch (status) {
    case 400:
    case 422:
      return new ApiError("BAD_REQUEST", message);
    case 401:
      return new ApiError("UNAUTHORIZED", message);
    case 403:
      return new ApiError("FORBIDDEN", message);
    case 404:
      return new ApiError("NOT_FOUND", message);
    case 409:
      return new ApiError("CONFLICT", message);
    default:
      return new ApiError("INTERNAL_SERVER_ERROR", message);
  }
}

/** One request against the absolute internal origin, throwing on a non-2xx answer. */
async function request<T>(origin: string, path: string, init: RequestInit): Promise<T> {
  const res = await fetch(`${origin}${path}`, init);

  if (!res.ok) throw statusError(res.status);

  const body = [204, 205, 304].includes(res.status) ? null : await res.text();

  // SAFETY: the route and the contract procedure document the same Rust DTO;
  // utoipa widens enum-valued fields to `string`, so the cast restores the
  // contract's narrower unions.
  return (body ? JSON.parse(body) : null) as T;
}

function read<T>(origin: string, path: string, headers: HeadersInit): Promise<T> {
  return request<T>(origin, path, { headers });
}

/** A panel write: the session cookie headers, the contract's verb, and an optional JSON body. */
function write<T, Body = unknown>(
  origin: string,
  path: string,
  headers: HeadersInit,
  method: "POST" | "PUT" | "DELETE",
  body?: Body,
): Promise<T> {
  const requestHeaders = new Headers(headers);
  requestHeaders.set("content-type", "application/json");

  return request<T>(origin, path, {
    method,
    headers: requestHeaders,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function createClient(origin: string, headers: HeadersInit): TenantClient {
  return {
    session: {
      login: (input) =>
        write<SessionResult<"login">>(origin, getLoginTenantSessionUrl(), headers, "POST", input),
      logout: () =>
        write<SessionResult<"logout">>(origin, getLogoutTenantSessionUrl(), headers, "POST"),
      current: () => read<PanelSession>(origin, getGetTenantSessionUrl(), headers),
      register: (input) =>
        write<SessionResult<"register">>(
          origin,
          getRegisterTenantAccountUrl(),
          headers,
          "POST",
          input,
        ),
    },
    account: {
      listSessions: () =>
        read<AccountResult<"listSessions">>(origin, getListAccountSessionsUrl(), headers),
      changePassword: (input) =>
        write<AccountResult<"changePassword">>(
          origin,
          getChangeAccountPasswordUrl(),
          headers,
          "PUT",
          input,
        ),
      revokeSession: ({ sessionId }) =>
        write<AccountResult<"revokeSession">>(
          origin,
          getRevokeAccountSessionUrl(sessionId),
          headers,
          "DELETE",
        ),
      revokeOtherSessions: () =>
        write<AccountResult<"revokeOtherSessions">>(
          origin,
          getRevokeOtherAccountSessionsUrl(),
          headers,
          "POST",
        ),
    },
    panel: {
      getStore: ({ storeSlug }) =>
        read<PanelResult<"getStore">>(origin, getGetPanelStoreUrl(storeSlug), headers),
      createStore: (input) =>
        write<PanelResult<"createStore">>(origin, getCreatePanelStoreUrl(), headers, "POST", input),
      listOrders: ({ storeSlug, ...params }) =>
        read<PanelResult<"listOrders">>(origin, getListPanelOrdersUrl(storeSlug, params), headers),
      getOrder: ({ storeSlug, orderCode }) =>
        read<PanelResult<"getOrder">>(origin, getGetPanelOrderUrl(storeSlug, orderCode), headers),
      getOrderTransitions: ({ storeSlug, orderCode }) =>
        read<PanelResult<"getOrderTransitions">>(
          origin,
          getGetPanelOrderTransitionsUrl(storeSlug, orderCode),
          headers,
        ),
      transitionOrder: ({ storeSlug, orderCode, ...input }) =>
        write<PanelResult<"transitionOrder">>(
          origin,
          getTransitionPanelOrderUrl(storeSlug, orderCode),
          headers,
          "POST",
          input,
        ),
      recordOrderPayment: ({ storeSlug, orderCode }) =>
        write<PanelResult<"recordOrderPayment">>(
          origin,
          getRecordPanelOrderPaymentUrl(storeSlug, orderCode),
          headers,
          "POST",
        ),
      listCustomers: ({ storeSlug }) =>
        read<PanelResult<"listCustomers">>(origin, getListPanelCustomersUrl(storeSlug), headers),
      getCustomer: ({ storeSlug, customerId }) =>
        read<PanelResult<"getCustomer">>(
          origin,
          getGetPanelCustomerUrl(storeSlug, customerId),
          headers,
        ),
      listProducts: ({ storeSlug, ...params }) =>
        read<PanelResult<"listProducts">>(
          origin,
          getListPanelProductsUrl(storeSlug, params),
          headers,
        ),
      getProduct: ({ storeSlug, productId }) =>
        read<PanelResult<"getProduct">>(
          origin,
          getGetPanelProductUrl(storeSlug, productId),
          headers,
        ),
      createProduct: ({ storeSlug, ...input }) =>
        write<PanelResult<"createProduct">>(
          origin,
          getCreatePanelProductUrl(storeSlug),
          headers,
          "POST",
          input,
        ),
      updateProduct: ({ storeSlug, productId, ...input }) =>
        write<PanelResult<"updateProduct">>(
          origin,
          getUpdatePanelProductUrl(storeSlug, productId),
          headers,
          "PUT",
          input,
        ),
      saveProductNutrition: ({ storeSlug, productId, ...input }) =>
        write<PanelResult<"saveProductNutrition">>(
          origin,
          getSavePanelProductNutritionUrl(storeSlug, productId),
          headers,
          "PUT",
          input,
        ),
      deleteProduct: ({ storeSlug, productId }) =>
        write<PanelResult<"deleteProduct">>(
          origin,
          getDeletePanelProductUrl(storeSlug, productId),
          headers,
          "DELETE",
        ),
      bulkUpdateProducts: ({ storeSlug, ...input }) =>
        write<PanelResult<"bulkUpdateProducts">>(
          origin,
          getBulkUpdatePanelProductsUrl(storeSlug),
          headers,
          "POST",
          input,
        ),
      bulkDeleteProducts: ({ storeSlug, ...input }) =>
        write<PanelResult<"bulkDeleteProducts">>(
          origin,
          getBulkDeletePanelProductsUrl(storeSlug),
          headers,
          "POST",
          input,
        ),
      listCategories: ({ storeSlug, ...params }) =>
        read<PanelResult<"listCategories">>(
          origin,
          getListPanelCategoriesUrl(storeSlug, params),
          headers,
        ),
      createCategory: ({ storeSlug, ...input }) =>
        write<PanelResult<"createCategory">>(
          origin,
          getCreatePanelCategoryUrl(storeSlug),
          headers,
          "POST",
          input,
        ),
      updateCategory: ({ storeSlug, categoryId, ...input }) =>
        write<PanelResult<"updateCategory">>(
          origin,
          getUpdatePanelCategoryUrl(storeSlug, categoryId),
          headers,
          "PUT",
          input,
        ),
      deleteCategory: ({ storeSlug, categoryId }) =>
        write<PanelResult<"deleteCategory">>(
          origin,
          getDeletePanelCategoryUrl(storeSlug, categoryId),
          headers,
          "DELETE",
        ),
      listSubcategories: ({ storeSlug, ...params }) =>
        read<PanelResult<"listSubcategories">>(
          origin,
          getListPanelSubcategoriesUrl(storeSlug, params),
          headers,
        ),
      createSubcategory: ({ storeSlug, ...input }) =>
        write<PanelResult<"createSubcategory">>(
          origin,
          getCreatePanelSubcategoryUrl(storeSlug),
          headers,
          "POST",
          input,
        ),
      updateSubcategory: ({ storeSlug, subcategoryId, ...input }) =>
        write<PanelResult<"updateSubcategory">>(
          origin,
          getUpdatePanelSubcategoryUrl(storeSlug, subcategoryId),
          headers,
          "PUT",
          input,
        ),
      deleteSubcategory: ({ storeSlug, subcategoryId }) =>
        write<PanelResult<"deleteSubcategory">>(
          origin,
          getDeletePanelSubcategoryUrl(storeSlug, subcategoryId),
          headers,
          "DELETE",
        ),
      listDepartments: ({ storeSlug, ...params }) =>
        read<PanelResult<"listDepartments">>(
          origin,
          getListPanelDepartmentsUrl(storeSlug, params),
          headers,
        ),
      createDepartment: ({ storeSlug, ...input }) =>
        write<PanelResult<"createDepartment">>(
          origin,
          getCreatePanelDepartmentUrl(storeSlug),
          headers,
          "POST",
          input,
        ),
      updateDepartment: ({ storeSlug, departmentId, ...input }) =>
        write<PanelResult<"updateDepartment">>(
          origin,
          getUpdatePanelDepartmentUrl(storeSlug, departmentId),
          headers,
          "PUT",
          input,
        ),
      deleteDepartment: ({ storeSlug, departmentId }) =>
        write<PanelResult<"deleteDepartment">>(
          origin,
          getDeletePanelDepartmentUrl(storeSlug, departmentId),
          headers,
          "DELETE",
        ),
      listTags: ({ storeSlug, ...params }) =>
        read<PanelResult<"listTags">>(origin, getListPanelTagsUrl(storeSlug, params), headers),
      createTag: ({ storeSlug, ...input }) =>
        write<PanelResult<"createTag">>(
          origin,
          getCreatePanelTagUrl(storeSlug),
          headers,
          "POST",
          input,
        ),
      updateTag: ({ storeSlug, tagId, ...input }) =>
        write<PanelResult<"updateTag">>(
          origin,
          getUpdatePanelTagUrl(storeSlug, tagId),
          headers,
          "PUT",
          input,
        ),
      deleteTag: ({ storeSlug, tagId }) =>
        write<PanelResult<"deleteTag">>(
          origin,
          getDeletePanelTagUrl(storeSlug, tagId),
          headers,
          "DELETE",
        ),
      listBadges: ({ storeSlug }) =>
        read<PanelResult<"listBadges">>(origin, getListPanelBadgesUrl(storeSlug), headers),
      createBadge: ({ storeSlug, ...input }) =>
        write<PanelResult<"createBadge">>(
          origin,
          getCreatePanelBadgeUrl(storeSlug),
          headers,
          "POST",
          input,
        ),
      updateBadge: ({ storeSlug, badgeId, ...input }) =>
        write<PanelResult<"updateBadge">>(
          origin,
          getUpdatePanelBadgeUrl(storeSlug, badgeId),
          headers,
          "PUT",
          input,
        ),
      deleteBadge: ({ storeSlug, badgeId }) =>
        write<PanelResult<"deleteBadge">>(
          origin,
          getDeletePanelBadgeUrl(storeSlug, badgeId),
          headers,
          "DELETE",
        ),
      listKits: ({ storeSlug }) =>
        read<PanelResult<"listKits">>(origin, getListPanelKitsUrl(storeSlug), headers),
      listCoupons: ({ storeSlug }) =>
        read<PanelResult<"listCoupons">>(origin, getListPanelCouponsUrl(storeSlug), headers),
      listCouponSummaries: ({ storeSlug }) =>
        read<PanelResult<"listCouponSummaries">>(
          origin,
          getListPanelCouponSummariesUrl(storeSlug),
          headers,
        ),
      getCouponDetail: ({ storeSlug, couponId, ...params }) =>
        read<PanelResult<"getCouponDetail">>(
          origin,
          getGetPanelCouponDetailUrl(storeSlug, couponId, params),
          headers,
        ),
      createCoupon: ({ storeSlug, ...input }) =>
        write<PanelResult<"createCoupon">>(
          origin,
          getCreatePanelCouponUrl(storeSlug),
          headers,
          "POST",
          input,
        ),
      updateCoupon: ({ storeSlug, couponId, ...input }) =>
        write<PanelResult<"updateCoupon">>(
          origin,
          getUpdatePanelCouponUrl(storeSlug, couponId),
          headers,
          "PUT",
          input,
        ),
      deleteCoupon: ({ storeSlug, couponId }) =>
        write<PanelResult<"deleteCoupon">>(
          origin,
          getDeletePanelCouponUrl(storeSlug, couponId),
          headers,
          "DELETE",
        ),
      setCouponStatus: ({ storeSlug, couponId, ...input }) =>
        write<PanelResult<"setCouponStatus">>(
          origin,
          getSetPanelCouponStatusUrl(storeSlug, couponId),
          headers,
          "POST",
          input,
        ),
      bulkDeleteCoupons: ({ storeSlug, ...input }) =>
        write<PanelResult<"bulkDeleteCoupons">>(
          origin,
          getBulkDeletePanelCouponsUrl(storeSlug),
          headers,
          "POST",
          input,
        ),
      getStoreSeo: ({ storeSlug }) =>
        read<PanelResult<"getStoreSeo">>(origin, getGetPanelStoreSeoUrl(storeSlug), headers),
      saveStoreSeo: ({ storeSlug, ...input }) =>
        write<PanelResult<"saveStoreSeo">>(
          origin,
          getSavePanelStoreSeoUrl(storeSlug),
          headers,
          "PUT",
          input,
        ),
      listSeoEntities: ({ storeSlug, ...params }) =>
        read<PanelResult<"listSeoEntities">>(
          origin,
          getListPanelSeoEntitiesUrl(storeSlug, params),
          headers,
        ),
      getSeo: ({ storeSlug, entityType, entityId }) =>
        read<PanelResult<"getSeo">>(
          origin,
          getGetPanelSeoUrl(storeSlug, entityType, entityId),
          headers,
        ),
      saveSeo: ({ storeSlug, entityType, entityId, ...input }) =>
        write<PanelResult<"saveSeo">>(
          origin,
          getSavePanelSeoUrl(storeSlug, entityType, entityId),
          headers,
          "PUT",
          input,
        ),
      revertSeo: ({ storeSlug, entityType, entityId }) =>
        write<PanelResult<"revertSeo">>(
          origin,
          getRevertPanelSeoUrl(storeSlug, entityType, entityId),
          headers,
          "DELETE",
        ),
      getPaymentSettings: ({ storeSlug }) =>
        read<PanelResult<"getPaymentSettings">>(
          origin,
          getGetPanelPaymentSettingsUrl(storeSlug),
          headers,
        ),
      savePaymentIntegration: ({ storeSlug, ...input }) =>
        write<PanelResult<"savePaymentIntegration">>(
          origin,
          getSavePanelPaymentIntegrationUrl(storeSlug),
          headers,
          "POST",
          input,
        ),
      deletePaymentIntegration: ({ storeSlug, integrationId }) =>
        write<PanelResult<"deletePaymentIntegration">>(
          origin,
          getDeletePanelPaymentIntegrationUrl(storeSlug, integrationId),
          headers,
          "DELETE",
        ),
      savePaymentMethodAssignment: ({ storeSlug, method, ...input }) =>
        write<PanelResult<"savePaymentMethodAssignment">>(
          origin,
          getSavePanelPaymentMethodAssignmentUrl(storeSlug, method),
          headers,
          "PUT",
          input,
        ),
      listIntegrations: ({ storeSlug }) =>
        read<PanelResult<"listIntegrations">>(
          origin,
          getListPanelIntegrationsUrl(storeSlug),
          headers,
        ),
      saveIntegration: ({ storeSlug, ...input }) =>
        write<PanelResult<"saveIntegration">>(
          origin,
          getSavePanelIntegrationUrl(storeSlug, input.integrationId),
          headers,
          "POST",
          input,
        ),
      listMcpSessions: ({ storeSlug }) =>
        read<PanelResult<"listMcpSessions">>(
          origin,
          getListPanelMcpSessionsUrl(storeSlug),
          headers,
        ),
      revokeMcpSession: ({ storeSlug, sessionId }) =>
        write<PanelResult<"revokeMcpSession">>(
          origin,
          getRevokePanelMcpSessionUrl(storeSlug, sessionId),
          headers,
          "POST",
        ),
      listAuditLogs: ({ storeSlug }) =>
        read<PanelResult<"listAuditLogs">>(origin, getListPanelAuditLogsUrl(storeSlug), headers),
      listTeamMembers: ({ storeSlug }) =>
        read<PanelResult<"listTeamMembers">>(
          origin,
          getListPanelTeamMembersUrl(storeSlug),
          headers,
        ),
      search: ({ storeSlug, ...params }) =>
        read<PanelResult<"search">>(origin, getSearchPanelUrl(storeSlug, params), headers),
    },
  };
}

/**
 * A panel client bound to the current request's session cookie, or `null` when
 * there is no `menuza_tenant_sid`. Server functions call it instead of
 * assembling a client per route; the API still revalidates the session, so
 * forwarding the cookie is a transport detail and not the authorization.
 */
export async function panelClient(): Promise<TenantClient | null> {
  const requestHeaders = getRequest().headers;
  const sessionId = readSessionCookie(requestHeaders.get("cookie"));

  if (!sessionId) return null;

  const headers = new Headers({ cookie: `${TENANT_SESSION_COOKIE}=${sessionId}` });
  const tenantId = requestHeaders.get("x-menuza-tenant-id");

  if (tenantId) headers.set("x-menuza-tenant-id", tenantId);

  return createClient(process.env.TENANT_INTERNAL_URL ?? "http://127.0.0.1:3002", headers);
}

/**
 * What the frontend may conclude from a session read.
 *
 * `unavailable` is deliberately not `unauthenticated`: a restarting or
 * unreachable tenant API must not sign the user out, so callers redirect only
 * on a definitive `unauthenticated` answer.
 */
export type PanelSessionState =
  | { status: "ok"; session: PanelSession }
  | { status: "unauthenticated" }
  | { status: "unavailable" };

/** A rejected call that proves the session is gone (and not that the API is down). */
function isUnauthenticated(error: Error): boolean {
  return error instanceof ApiError && (error.code === "UNAUTHORIZED" || error.code === "FORBIDDEN");
}

/**
 * Reads the session for the current request and says which of the three states
 * it is in: signed in, signed out, or the API could not be asked.
 */
export async function readPanelSession(): Promise<PanelSessionState> {
  const client = await panelClient();

  if (!client) return { status: "unauthenticated" };

  try {
    return { status: "ok", session: await client.session.current() };
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error("Falha ao ler a sessão.");

    return isUnauthenticated(error) ? { status: "unauthenticated" } : { status: "unavailable" };
  }
}

/**
 * Returns the authenticated panel session for the current request, or `null`
 * when there is no usable `menuza_tenant_sid` cookie.
 */
export async function getPanelSession(): Promise<PanelSession | null> {
  const state = await readPanelSession();

  return state.status === "ok" ? state.session : null;
}
