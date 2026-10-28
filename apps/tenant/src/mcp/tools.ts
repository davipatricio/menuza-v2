/**
 * The admin MCP tool catalog.
 *
 * Each entry names a `panel.*` procedure the dashboard already implements, the
 * capability a role needs to see it, and nothing more. A tool call is delegated
 * to that same procedure implementation, so store resolution, the OAuth store
 * grant, the membership row and the capability map all run exactly once, in the
 * place that already owns them. A tool can never be more permissive than the
 * equivalent dashboard call.
 *
 * The input JSON Schema is derived from the procedure's own Valibot input
 * schema. `errorMode: "ignore"` drops the `check` actions, which have no JSON
 * Schema form; the procedure still validates the call on the way in.
 */
import { toJsonSchema, type JsonSchema } from "@valibot/to-json-schema";
import type { AnyProcedure } from "@orpc/server";
import type { BaseIssue, BaseSchema } from "valibot";
import { can, isTenantRole, type TenantCapability } from "@menuza/orpc-server/auth";
import {
  CreateCouponInputSchema,
  CreateProductInputSchema,
  DeleteProductInputSchema,
  ListCategoriesInputSchema,
  ListDepartmentsInputSchema,
  ListProductsInputSchema,
  ListTagsInputSchema,
  PanelCustomerIdInputSchema,
  PanelOrderIdInputSchema,
  PanelOrderTransitionInputSchema,
  PanelOrdersInputSchema,
  PanelSeoEntitiesInputSchema,
  PanelStoreInputSchema,
  ProductIdInputSchema,
  UpdateProductInputSchema,
} from "@menuza/shared/tenant";
import { panelSubdomainRouter } from "@menuza/api-tenant";

export interface ToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  /** Capability the caller's role must hold for this tool to be listed. */
  readonly capability: TenantCapability;
  readonly input: BaseSchema<unknown, unknown, BaseIssue<unknown>>;
  readonly impl: AnyProcedure;
}

/**
 * Every tool is store-scoped, so every input carries `storeSlug`. Reads outrank
 * writes in the ordering only so a listing reads as a tour of the store.
 */
export const TOOLS: readonly ToolDefinition[] = [
  {
    name: "orders_list",
    title: "Listar pedidos",
    description:
      "Lista os pedidos da loja, do mais recente ao mais antigo. Filtre por situação financeira, de atendimento ou forma de pagamento.",
    capability: "orders:read",
    input: PanelOrdersInputSchema,
    impl: panelSubdomainRouter.listOrders,
  },
  {
    name: "order_get",
    title: "Detalhar pedido",
    description: "Um pedido pelo código, com itens e a trilha de eventos.",
    capability: "orders:read",
    input: PanelOrderIdInputSchema,
    impl: panelSubdomainRouter.getOrder,
  },
  {
    name: "order_list_transitions",
    title: "Transições do pedido",
    description:
      "As mudanças de estado permitidas para o pedido, nos eixos financeiro e de atendimento.",
    capability: "orders:read",
    input: PanelOrderIdInputSchema,
    impl: panelSubdomainRouter.getOrderTransitions,
  },
  {
    name: "order_transition",
    title: "Mudar situação do pedido",
    description:
      "Aplica uma transição de estado. Estornos exigem a capacidade orders:refund; algumas transições exigem motivo.",
    capability: "orders:write",
    input: PanelOrderTransitionInputSchema,
    impl: panelSubdomainRouter.transitionOrder,
  },
  {
    name: "products_list",
    title: "Listar produtos",
    description: "O catálogo da loja com preço, categoria, estoque e tags.",
    capability: "dashboard:read",
    input: ListProductsInputSchema,
    impl: panelSubdomainRouter.listProducts,
  },
  {
    name: "product_get",
    title: "Detalhar produto",
    description: "Um produto pelo id, com variações, tags e nutrição.",
    capability: "dashboard:read",
    input: ProductIdInputSchema,
    impl: panelSubdomainRouter.getProduct,
  },
  {
    name: "product_create",
    title: "Criar produto",
    description: "Cria um produto com ao menos uma variação. Preços em centavos.",
    capability: "catalog:write",
    input: CreateProductInputSchema,
    impl: panelSubdomainRouter.createProduct,
  },
  {
    name: "product_update",
    title: "Atualizar produto",
    description:
      "Atualização parcial: campo omitido permanece, null limpa o valor. Enviar variations substitui a lista inteira, mantendo os ids enviados.",
    capability: "catalog:write",
    input: UpdateProductInputSchema,
    impl: panelSubdomainRouter.updateProduct,
  },
  {
    name: "product_delete",
    title: "Excluir produto",
    description: "Remove um produto do catálogo.",
    capability: "catalog:write",
    input: DeleteProductInputSchema,
    impl: panelSubdomainRouter.deleteProduct,
  },
  {
    name: "customers_list",
    title: "Listar clientes",
    description: "Os clientes da loja com número de pedidos e total gasto.",
    capability: "dashboard:read",
    input: PanelStoreInputSchema,
    impl: panelSubdomainRouter.listCustomers,
  },
  {
    name: "customer_get",
    title: "Detalhar cliente",
    description: "Um cliente pelo id, com seus pedidos.",
    capability: "dashboard:read",
    input: PanelCustomerIdInputSchema,
    impl: panelSubdomainRouter.getCustomer,
  },
  {
    name: "coupons_list",
    title: "Listar cupons",
    description: "Os cupons da loja com limites e janela de validade.",
    capability: "dashboard:read",
    input: PanelStoreInputSchema,
    impl: panelSubdomainRouter.listCoupons,
  },
  {
    name: "coupon_create",
    title: "Criar cupom",
    description:
      "Cria um cupom. discountValue é centavos quando discountType=fixed e porcentagem inteira quando percentage.",
    capability: "catalog:write",
    input: CreateCouponInputSchema,
    impl: panelSubdomainRouter.createCoupon,
  },
  {
    name: "categories_list",
    title: "Listar categorias",
    description: "As categorias do catálogo com contagem de itens.",
    capability: "dashboard:read",
    input: ListCategoriesInputSchema,
    impl: panelSubdomainRouter.listCategories,
  },
  {
    name: "departments_list",
    title: "Listar departamentos",
    description: "Os departamentos do catálogo com contagem de itens.",
    capability: "dashboard:read",
    input: ListDepartmentsInputSchema,
    impl: panelSubdomainRouter.listDepartments,
  },
  {
    name: "tags_list",
    title: "Listar tags",
    description: "As tags do catálogo com contagem de itens.",
    capability: "dashboard:read",
    input: ListTagsInputSchema,
    impl: panelSubdomainRouter.listTags,
  },
  {
    name: "seo_list_entities",
    title: "Listar entidades com SEO",
    description: "As entidades da loja que têm override de SEO.",
    capability: "seo:write",
    input: PanelSeoEntitiesInputSchema,
    impl: panelSubdomainRouter.listSeoEntities,
  },
  {
    name: "audit_list",
    title: "Listar auditoria",
    description: "A trilha de auditoria da loja, do mais recente ao mais antigo.",
    capability: "dashboard:read",
    input: PanelStoreInputSchema,
    impl: panelSubdomainRouter.listAuditLogs,
  },
];

/** A tool as it crosses the wire, after the caller's grant narrowed it. */
export interface WireTool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
}

/** The catalog as one caller may see it, plus the lookup a call needs. */
export interface Toolset {
  tools: WireTool[];
  byName: Map<string, ToolDefinition>;
}

/**
 * An unrecognized stored role is the least-privileged known role, matching the
 * panel's own canonicalization in `resolveStore`.
 */
function roleCan(role: string, capability: TenantCapability): boolean {
  return can(isTenantRole(role) ? role : "staff", capability);
}

/**
 * The tool list for one caller.
 *
 * The role filter is the same map the procedures enforce, applied here only so
 * a `staff` token never sees a tool the API would refuse; the procedure still
 * re-checks on call. When the token grants exactly one store, `storeSlug` is
 * removed from the schema and from `required`, because the call cannot mean
 * anything else. With two or more grants it stays required and the caller picks.
 */
export function toolsFor(options: {
  roles: Iterable<string>;
  singleStoreSlug: string | null;
}): Toolset {
  const roles = [...options.roles];
  const byName = new Map<string, ToolDefinition>();
  const tools: WireTool[] = [];

  for (const tool of TOOLS) {
    if (!roles.some((role) => roleCan(role, tool.capability))) continue;

    let inputSchema = toJsonSchema(tool.input, { errorMode: "ignore" });

    if (options.singleStoreSlug) inputSchema = withoutStoreSlug(inputSchema);

    byName.set(tool.name, tool);
    tools.push({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema,
    });
  }

  return { tools, byName };
}

/** Drops `storeSlug` from `properties` and `required`. */
function withoutStoreSlug(schema: JsonSchema): JsonSchema {
  if (!schema.properties || Array.isArray(schema.properties)) return schema;

  const { storeSlug: _dropped, ...properties } = schema.properties;

  const required = schema.required?.filter((key) => key !== "storeSlug");

  return { ...schema, properties, required };
}
