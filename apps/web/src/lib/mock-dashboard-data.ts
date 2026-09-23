/**
 * Fixtures do painel por loja.
 *
 * O mockup é multi-loja: `mawifoods` tem dados completos (reusando os arrays
 * de `mock-store-data.ts`) e `nova-loja` é vazia, para demonstrar o
 * picker e os estados vazios. Nenhum dado aqui é real.
 */
import {
  MOCK_AUDIT_LOGS,
  MOCK_COUPONS,
  MOCK_CUSTOMERS,
  MOCK_ORDERS,
  type AuditLogItem,
  type CouponItem,
  type CustomerItem,
  type CustomerStats,
  type OrderItem,
  type OrderStatus,
} from "./mock-store-data.ts";

export interface DashboardStore {
  slug: string;
  displayName: string;
  /** Papel do usuário nesta loja. Exibido no picker e no menu da conta. */
  role: string;
}

export const MOCK_STORES: DashboardStore[] = [
  { slug: "mawifoods", displayName: "Mawifoods", role: "Proprietária" },
  { slug: "nova-loja", displayName: "Nova Loja", role: "Administrador" },
];

/** Usuário demonstrado no mockup. Ainda não há sessão real (MEN-225). */
export const MOCK_CURRENT_USER = { name: "Marina Lopes" } as const;

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: "Pendente",
  CONFIRMED: "Confirmado",
  READY: "Pronto",
  DELIVERED: "Entregue",
  CANCELED: "Cancelado",
  AWAITING_PAYMENT: "Aguardando pagamento",
  PAID: "Pago",
  READY_FOR_PICKUP: "Pronto para retirada",
  COMPLETED: "Concluído",
  REFUNDED: "Reembolsado",
  EXPIRED: "Expirado",
};

export interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  available: boolean;
}

export interface CatalogCategory {
  id: string;
  name: string;
  itemsCount: number;
}

export const MOCK_PRODUCTS: CatalogProduct[] = [
  { id: "1", name: "Marmita frango grelhado", category: "Marmitas", price: 24.9, available: true },
  { id: "2", name: "Marmita carne desfiada", category: "Marmitas", price: 27.9, available: true },
  { id: "3", name: "Suco verde 500ml", category: "Bebidas", price: 12.0, available: true },
  { id: "4", name: "Brownie low carb", category: "Sobremesas", price: 9.5, available: false },
];

export const MOCK_CATEGORIES: CatalogCategory[] = [
  { id: "1", name: "Marmitas", itemsCount: 2 },
  { id: "2", name: "Bebidas", itemsCount: 1 },
  { id: "3", name: "Sobremesas", itemsCount: 1 },
];

function hasFixtureData(slug: string): boolean {
  return slug === "mawifoods";
}

export function getStore(slug: string): DashboardStore | undefined {
  return MOCK_STORES.find((store) => store.slug === slug);
}

export function getStoreOrders(slug: string): OrderItem[] {
  return hasFixtureData(slug) ? MOCK_ORDERS : [];
}

export function getStoreOrderByCode(slug: string, code: string): OrderItem | undefined {
  return getStoreOrders(slug).find((order) => order.code === code);
}

export function getStoreCustomers(slug: string): CustomerItem[] {
  return hasFixtureData(slug) ? MOCK_CUSTOMERS : [];
}

export function getStoreCustomerById(slug: string, id: string): CustomerItem | undefined {
  return getStoreCustomers(slug).find((customer) => customer.id === id);
}

export function getStoreCustomerOrders(slug: string, customerId: string): OrderItem[] {
  return getStoreOrders(slug).filter((order) => order.customerId === customerId);
}

/**
 * Per-customer aggregates derived from the order fixtures, so the table
 * columns and the customer detail page can never disagree.
 */
export function getStoreCustomerStats(slug: string, customerId: string): CustomerStats {
  const orders = getStoreCustomerOrders(slug, customerId);

  return {
    ordersCount: orders.length,
    totalSpent: orders.reduce((sum, order) => sum + order.total, 0),
  };
}

export function getStoreCoupons(slug: string): CouponItem[] {
  return hasFixtureData(slug) ? MOCK_COUPONS : [];
}

export function getStoreAuditLogs(slug: string): AuditLogItem[] {
  return hasFixtureData(slug) ? MOCK_AUDIT_LOGS : [];
}

export function getStoreProducts(slug: string): CatalogProduct[] {
  return hasFixtureData(slug) ? MOCK_PRODUCTS : [];
}

export function getStoreCategories(slug: string): CatalogCategory[] {
  return hasFixtureData(slug) ? MOCK_CATEGORIES : [];
}
