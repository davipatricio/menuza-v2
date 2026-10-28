/**
 * The store integration catalog.
 *
 * An integration exists because a module ships — the list is code, not a table
 * — and `StoreIntegration` holds only the per-store state (on/off, status, the
 * store's own config). Adding GA4 or Lalamove means adding an entry here plus
 * whatever server module implements it; nothing about the storage, the list
 * page or the detail page changes.
 *
 * Browser-safe: ids, copy and JSON-Schema-ish field descriptors only.
 */
import * as v from "valibot";

/** The catalog groups the Integrations tab is divided into. */
export const IntegrationSectionSchema = v.picklist(["scripts", "connections", "payments"]);

export type IntegrationSection = v.InferOutput<typeof IntegrationSectionSchema>;

export const INTEGRATION_SECTION_LABELS: Record<IntegrationSection, string> = {
  scripts: "Scripts",
  connections: "Conexões",
  payments: "Pagamentos",
};

/** Written by the platform; `error` and `paused` are set by the integration's own checks. */
export const IntegrationStatusSchema = v.picklist(["enabled", "disabled", "paused", "error"]);

export type IntegrationStatus = v.InferOutput<typeof IntegrationStatusSchema>;

export const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  enabled: "Ativado",
  disabled: "Desativado",
  paused: "Pausado",
  error: "Erro",
};

/**
 * One setting the detail page renders. The union is deliberately small — a
 * switch, a text field and a textarea cover every integration on the roadmap;
 * an integration that needs more grows this union rather than embedding JSX in
 * the catalog.
 */
export const IntegrationSettingSchema = v.variant("type", [
  v.object({
    type: v.literal("switch"),
    key: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    default: v.boolean(),
  }),
  v.object({
    type: v.literal("text"),
    key: v.string(),
    label: v.string(),
    description: v.optional(v.string()),
    placeholder: v.optional(v.string()),
    default: v.string(),
  }),
]);

export type IntegrationSetting = v.InferOutput<typeof IntegrationSettingSchema>;

/**
 * What the detail page can offer beyond settings. `connect` renders the MCP
 * connect button and the session list; `logs` and `sync` are placeholders the
 * integrations that own them fill in.
 */
export const IntegrationCapabilitySchema = v.picklist(["connect", "sessions", "sync", "logs"]);

export type IntegrationCapability = v.InferOutput<typeof IntegrationCapabilitySchema>;

/**
 * A brand mark: the 24×24 path from Simple Icons plus the brand's own hex.
 *
 * Inline rather than an `<img>`: the list page draws ~9 of them and a per-card
 * network request would be the whole page's budget. `hex` is the official brand
 * colour, so a card reads as the product it connects to and not as a generic
 * puzzle piece.
 */
export interface IntegrationLogo {
  readonly path: string;
  readonly hex: string;
}

/**
 * The brand marks, inlined.
 *
 * Each path is the 24×24 glyph from Simple Icons (CC0) with its official brand
 * colour. Inlined rather than imported so `@menuza/shared` stays dependency-free
 * and the browser parses no extra module for nine small strings. Spoke and
 * Pagar.me have no mark there; their cards fall back to a monogram.
 */
const LOGO = {
  googleAnalytics: {
    hex: "E37400",
    path: "M22.84 2.9982v17.9987c.0086 1.6473-1.3197 2.9897-2.967 2.9984a2.9808 2.9808 0 01-.3677-.0208c-1.528-.226-2.6477-1.5558-2.6105-3.1V3.1204c-.0369-1.5458 1.0856-2.8762 2.6157-3.1 1.6361-.1915 3.1178.9796 3.3093 2.6158.014.1201.0208.241.0202.3619zM4.1326 18.0548c-1.6417 0-2.9726 1.331-2.9726 2.9726C1.16 22.6691 2.4909 24 4.1326 24s2.9726-1.3309 2.9726-2.9726-1.331-2.9726-2.9726-2.9726zm7.8728-9.0098c-.0171 0-.0342 0-.0513.0003-1.6495.0904-2.9293 1.474-2.891 3.1256v7.9846c0 2.167.9535 3.4825 2.3505 3.763 1.6118.3266 3.1832-.7152 3.5098-2.327.04-.1974.06-.3983.0593-.5998v-8.9585c.003-1.6474-1.33-2.9852-2.9773-2.9882z",
  },
  googleTagManager: {
    hex: "246FDB",
    path: "M12.003 0a3 3 0 0 0-2.121 5.121l6.865 6.865-4.446 4.541 1.745 1.836a3.432 3.432 0 0 1 .7.739l.012.011-.001.002a3.432 3.432 0 0 1 .609 1.953 3.432 3.432 0 0 1-.09.78l7.75-7.647c.031-.029.067-.05.098-.08.023-.023.038-.052.06-.076a2.994 2.994 0 0 0-.06-4.166l-9-9A2.99 2.99 0 0 0 12.003 0zM8.63 2.133L.88 9.809a2.998 2.998 0 0 0 0 4.238l7.7 7.75a3.432 3.432 0 0 1-.077-.729 3.432 3.432 0 0 1 3.431-3.431 3.432 3.432 0 0 1 .826.101l-5.523-5.81 4.371-4.373-2.08-2.08c-.903-.904-1.193-2.183-.898-3.342zm3.304 16.004a2.932 2.932 0 0 0-2.931 2.931A2.932 2.932 0 0 0 11.934 24a2.932 2.932 0 0 0 2.932-2.932 2.932 2.932 0 0 0-2.932-2.931z",
  },
  meta: {
    hex: "0467DF",
    path: "M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z",
  },
  modelContextProtocol: {
    hex: "000000",
    path: "M13.85 0a4.16 4.16 0 0 0-2.95 1.217L1.456 10.66a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l9.442-9.442a2.49 2.49 0 0 1 3.541 0 2.49 2.49 0 0 1 0 3.541L8.59 12.97l-.1.1a.835.835 0 0 0 0 1.18.835.835 0 0 0 1.18 0l.1-.098 7.03-7.034a2.49 2.49 0 0 1 3.542 0l.049.05a2.49 2.49 0 0 1 0 3.54l-8.54 8.54a1.96 1.96 0 0 0 0 2.755l1.753 1.753a.835.835 0 0 0 1.18 0 .835.835 0 0 0 0-1.18l-1.753-1.753a.266.266 0 0 1 0-.394l8.54-8.54a4.185 4.185 0 0 0 0-5.9l-.05-.05a4.16 4.16 0 0 0-2.95-1.218c-.2 0-.401.02-.6.048a4.17 4.17 0 0 0-1.17-3.552A4.16 4.16 0 0 0 13.85 0m0 3.333a.84.84 0 0 0-.59.245L6.275 10.56a4.186 4.186 0 0 0 0 5.902 4.186 4.186 0 0 0 5.902 0L19.16 9.48a.835.835 0 0 0 0-1.18.835.835 0 0 0-1.18 0l-6.985 6.984a2.49 2.49 0 0 1-3.54 0 2.49 2.49 0 0 1 0-3.54l6.983-6.985a.835.835 0 0 0 0-1.18.84.84 0 0 0-.59-.245",
  },
} as const satisfies Record<string, IntegrationLogo>;

export interface IntegrationDefinition {
  /** Stable catalog id, also the `StoreIntegration.integrationId` value. */
  readonly id: string;
  readonly name: string;
  readonly section: IntegrationSection;
  readonly description: string;
  /** Who maintains it. Every first-party integration is Menuza. */
  readonly author: string;
  /** `null` for an integration with no brand mark to show (a wordmark card). */
  readonly logo: IntegrationLogo | null;
  /**
   * Illustrative images for the detail page, as public paths. Omitted for every
   * integration today — the gallery only renders when one ships artwork.
   */
  readonly screenshots?: readonly string[];
  readonly settings: readonly IntegrationSetting[];
  readonly capabilities: readonly IntegrationCapability[];
  /**
   * True while the integration is wired to a placeholder. The detail page says
   * so instead of pretending a switch does something.
   */
  readonly mock: boolean;
}

/**
 * Every integration the dashboard knows about.
 *
 * Only `mcp-dashboard` is wired end to end (OAuth + the remote MCP server).
 * The others are catalogued so the page has its sections and so adding one is a
 * matter of replacing `mock: true` with an implementation.
 */
export const INTEGRATIONS: readonly IntegrationDefinition[] = [
  // --- Scripts -------------------------------------------------------------
  {
    id: "google-analytics-4",
    name: "Google Analytics 4",
    section: "scripts",
    description: "Envia eventos de compra e navegação da loja para uma propriedade do GA4.",
    author: "Menuza",
    logo: LOGO.googleAnalytics,
    settings: [
      {
        type: "text",
        key: "measurementId",
        label: "ID de medição",
        description: "O identificador G-XXXXXXX da propriedade.",
        placeholder: "G-XXXXXXXXXX",
        default: "",
      },
      {
        type: "switch",
        key: "trackPurchases",
        label: "Enviar eventos de compra",
        description: "Inclui `purchase` com valor e itens quando um pedido é pago.",
        default: true,
      },
    ],
    capabilities: [],
    mock: true,
  },
  {
    id: "google-tag-manager",
    name: "Google Tag Manager",
    section: "scripts",
    description: "Carrega um contêiner do GTM na vitrine para tags próprias do lojista.",
    author: "Menuza",
    logo: LOGO.googleTagManager,
    settings: [
      {
        type: "text",
        key: "containerId",
        label: "ID do contêiner",
        placeholder: "GTM-XXXXXXX",
        default: "",
      },
    ],
    capabilities: [],
    mock: true,
  },
  {
    id: "meta-pixel",
    name: "Meta Pixel",
    section: "scripts",
    description: "Rastreia visitas e compras para campanhas no Facebook e Instagram.",
    author: "Menuza",
    logo: LOGO.meta,
    settings: [
      { type: "text", key: "pixelId", label: "ID do pixel", default: "" },
      {
        type: "switch",
        key: "trackPurchases",
        label: "Enviar eventos de compra",
        default: true,
      },
    ],
    capabilities: [],
    mock: true,
  },
  // --- Connections ---------------------------------------------------------
  {
    id: "spoke",
    name: "Spoke",
    section: "connections",
    description: "Sincroniza pedidos e catálogo com o Spoke.",
    author: "Menuza",
    logo: null,
    settings: [
      { type: "text", key: "apiKey", label: "Chave de API", default: "" },
      {
        type: "switch",
        key: "syncCatalog",
        label: "Sincronizar catálogo",
        default: true,
      },
    ],
    capabilities: ["sync", "logs"],
    mock: true,
  },
  {
    id: "mcp-dashboard",
    name: "MCP — Painel administrativo",
    section: "connections",
    description:
      "Deixa assistentes de IA (Claude Code, Codex, ChatGPT) operarem o painel desta loja: consultar e criar produtos, ler pedidos, mover o status e emitir cupons.",
    author: "Menuza",
    logo: LOGO.modelContextProtocol,
    settings: [
      {
        type: "switch",
        key: "allowDashboard",
        label: "Habilitar para o painel administrativo",
        description: "Expõe as ferramentas do painel aos clientes MCP conectados.",
        default: true,
      },
      {
        type: "switch",
        key: "allowStorefront",
        label: "Habilitar para clientes na loja",
        description:
          "Reserva o acesso de compradores. O MCP da vitrine ainda não está disponível; a opção fica registrada para quando estiver.",
        default: false,
      },
    ],
    capabilities: ["connect", "sessions"],
    mock: false,
  },
  {
    id: "mcp-storefront",
    name: "MCP — Loja",
    section: "connections",
    description:
      "Assistentes de IA do lado do comprador: buscar no cardápio, montar o carrinho e acompanhar o pedido. Scoped a um comprador por loja.",
    author: "Menuza",
    logo: LOGO.modelContextProtocol,
    settings: [],
    capabilities: [],
    mock: true,
  },
  // --- Payments ------------------------------------------------------------
  {
    id: "pagarme",
    name: "Pagar.me",
    section: "payments",
    description: "Recebe Pix, cartão e boleto com conciliação automática dos pedidos.",
    author: "Menuza",
    logo: null,
    settings: [{ type: "text", key: "secretKey", label: "Chave secreta", default: "" }],
    capabilities: ["logs"],
    mock: true,
  },
  {
    id: "lalamove",
    name: "Lalamove",
    section: "connections",
    description: "Cotação e despacho de entregas por motoboy.",
    author: "Menuza",
    logo: null,
    settings: [
      { type: "text", key: "apiKey", label: "Chave de API", default: "" },
      { type: "text", key: "serviceType", label: "Tipo de serviço", default: "MOTORCYCLE" },
    ],
    capabilities: ["sync", "logs"],
    mock: true,
  },
  {
    id: "google-merchant-center",
    name: "Google Merchant Center",
    section: "connections",
    description: "Publica o catálogo da loja no Shopping.",
    author: "Menuza",
    logo: null,
    settings: [{ type: "text", key: "merchantId", label: "ID do comerciante", default: "" }],
    capabilities: ["sync"],
    mock: true,
  },
];

export function findIntegration(id: string): IntegrationDefinition | undefined {
  return INTEGRATIONS.find((integration) => integration.id === id);
}

/** The default config for an integration that has never been saved. */
export function defaultConfigFor(integration: IntegrationDefinition) {
  const config: Record<string, string | boolean> = {};

  for (const setting of integration.settings) config[setting.key] = setting.default;

  return config;
}
