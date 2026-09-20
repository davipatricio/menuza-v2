export interface OrderItem {
  id: string;
  code: string;
  customerName: string;
  total: number;
  status: "PENDING" | "CONFIRMED" | "READY" | "DELIVERED" | "CANCELED";
  createdAt: string;
}

export interface CustomerItem {
  id: string;
  name: string;
  email: string;
  phone: string;
  ordersCount: number;
  totalSpent: number;
}

export interface CouponItem {
  id: string;
  code: string;
  discountType: "PERCENTAGE" | "FIXED";
  value: number;
  usageCount: number;
  status: "ACTIVE" | "EXPIRED" | "DISABLED";
}

export interface AuditLogItem {
  id: string;
  action: string;
  actor: string;
  target: string;
  ip: string;
  timestamp: string;
}

export const MOCK_ORDERS: OrderItem[] = [
  {
    id: "1",
    code: "ORD-101",
    customerName: "Maria Silva",
    total: 145.5,
    status: "READY",
    createdAt: "2026-09-20 12:30",
  },
  {
    id: "2",
    code: "ORD-102",
    customerName: "João Santos",
    total: 82.0,
    status: "CONFIRMED",
    createdAt: "2026-09-20 12:45",
  },
  {
    id: "3",
    code: "ORD-103",
    customerName: "Ana Souza",
    total: 210.0,
    status: "DELIVERED",
    createdAt: "2026-09-20 11:15",
  },
  {
    id: "4",
    code: "ORD-104",
    customerName: "Carlos Lima",
    total: 49.9,
    status: "PENDING",
    createdAt: "2026-09-20 13:00",
  },
  {
    id: "5",
    code: "ORD-105",
    customerName: "Beatriz Costa",
    total: 120.0,
    status: "CANCELED",
    createdAt: "2026-09-20 10:20",
  },
  {
    id: "6",
    code: "ORD-106",
    customerName: "Lucas Ferreira",
    total: 95.0,
    status: "CONFIRMED",
    createdAt: "2026-09-20 13:10",
  },
  {
    id: "7",
    code: "ORD-107",
    customerName: "Fernanda Rocha",
    total: 310.0,
    status: "READY",
    createdAt: "2026-09-20 13:15",
  },
  {
    id: "8",
    code: "ORD-108",
    customerName: "Rafael Ramos",
    total: 64.0,
    status: "PENDING",
    createdAt: "2026-09-20 13:20",
  },
  {
    id: "9",
    code: "ORD-109",
    customerName: "Juliana Alves",
    total: 178.2,
    status: "DELIVERED",
    createdAt: "2026-09-20 09:40",
  },
  {
    id: "10",
    code: "ORD-110",
    customerName: "Rodrigo Mendes",
    total: 54.0,
    status: "CONFIRMED",
    createdAt: "2026-09-20 13:25",
  },
];

export const MOCK_CUSTOMERS: CustomerItem[] = [
  {
    id: "1",
    name: "Maria Silva",
    email: "maria@example.com",
    phone: "+55 11 98888-1111",
    ordersCount: 12,
    totalSpent: 1420.5,
  },
  {
    id: "2",
    name: "João Santos",
    email: "joao@example.com",
    phone: "+55 11 97777-2222",
    ordersCount: 4,
    totalSpent: 350.0,
  },
  {
    id: "3",
    name: "Ana Souza",
    email: "ana@example.com",
    phone: "+55 21 96666-3333",
    ordersCount: 22,
    totalSpent: 3100.0,
  },
  {
    id: "4",
    name: "Carlos Lima",
    email: "carlos@example.com",
    phone: "+55 31 95555-4444",
    ordersCount: 1,
    totalSpent: 49.9,
  },
  {
    id: "5",
    name: "Beatriz Costa",
    email: "beatriz@example.com",
    phone: "+55 41 94444-5555",
    ordersCount: 6,
    totalSpent: 720.0,
  },
];

export const MOCK_COUPONS: CouponItem[] = [
  {
    id: "1",
    code: "BEMVINDO10",
    discountType: "PERCENTAGE",
    value: 10,
    usageCount: 142,
    status: "ACTIVE",
  },
  { id: "2", code: "QUERO20", discountType: "FIXED", value: 20, usageCount: 45, status: "ACTIVE" },
  {
    id: "3",
    code: "BLACKFRIDAY",
    discountType: "PERCENTAGE",
    value: 30,
    usageCount: 500,
    status: "EXPIRED",
  },
  { id: "4", code: "TESTE", discountType: "FIXED", value: 5, usageCount: 0, status: "DISABLED" },
];

export const MOCK_AUDIT_LOGS: AuditLogItem[] = [
  {
    id: "1",
    action: "DOMAIN_ADD",
    actor: "admin@menuza.com",
    target: "loja-matriz.menuza.com",
    ip: "192.168.1.1",
    timestamp: "2026-09-20 10:12:00",
  },
  {
    id: "2",
    action: "CONFIG_UPDATE",
    actor: "admin@menuza.com",
    target: "settings.payment.pix",
    ip: "192.168.1.1",
    timestamp: "2026-09-20 10:30:15",
  },
  {
    id: "3",
    action: "COUPON_CREATE",
    actor: "gestor@menuza.com",
    target: "BEMVINDO10",
    ip: "177.12.89.4",
    timestamp: "2026-09-20 11:05:40",
  },
  {
    id: "4",
    action: "ORDER_STATUS_UPDATE",
    actor: "operador@menuza.com",
    target: "ORD-101 (READY)",
    ip: "10.0.0.12",
    timestamp: "2026-09-20 12:31:02",
  },
  {
    id: "5",
    action: "DOMAIN_VERIFY",
    actor: "system",
    target: "loja-matriz.menuza.com",
    ip: "127.0.0.1",
    timestamp: "2026-09-20 12:40:00",
  },
];
