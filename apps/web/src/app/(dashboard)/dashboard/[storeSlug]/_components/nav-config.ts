import {
  Award,
  Boxes,
  FolderTree,
  Layers,
  LayoutDashboard,
  ListTree,
  Package,
  Puzzle,
  ScrollText,
  ShoppingCart,
  Tag,
  Ticket,
  Users,
} from "lucide-react";

type NavIcon = typeof LayoutDashboard;

export interface NavLeaf {
  href: string;
  label: string;
  icon: NavIcon;
  keywords: string[];
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavLeaf[];
}

export interface SettingsChild {
  href: string;
  label: string;
  keywords: string[];
}

export interface NavPage {
  label: string;
  href: string;
  section?: string;
}

export const SETTINGS_CHILDREN: SettingsChild[] = [
  {
    href: "store",
    label: "Loja",
    keywords: ["loja", "estabelecimento", "dados da loja", "nome"],
  },
  {
    href: "delivery",
    label: "Entrega",
    keywords: ["entrega", "frete", "delivery", "taxa", "endereço"],
  },
  {
    href: "payments",
    label: "Pagamentos",
    keywords: ["pagamento", "financeiro", "pix", "cartão", "cobrança"],
  },
  {
    href: "notifications",
    label: "Notificações",
    keywords: ["notificação", "aviso", "alerta", "push", "e-mail"],
  },
  {
    href: "team",
    label: "Equipe",
    keywords: ["equipe", "membros", "usuários", "time", "permissões", "papéis"],
  },
  {
    href: "account",
    label: "Conta",
    keywords: ["conta", "perfil", "senha", "sessões", "segurança"],
  },
];

export function navGroups(basePath: string): NavGroup[] {
  return [
    {
      label: "Operação",
      items: [
        {
          href: basePath,
          label: "Dashboard",
          icon: LayoutDashboard,
          exact: true,
          keywords: ["painel", "início", "home", "visão geral", "resumo"],
        },
        {
          href: `${basePath}/orders`,
          label: "Pedidos",
          icon: ShoppingCart,
          keywords: ["pedido", "ordem", "vendas", "compras"],
        },
      ],
    },
    {
      label: "Catálogo",
      items: [
        {
          href: `${basePath}/catalog/products`,
          label: "Produtos",
          icon: Package,
          keywords: ["produto", "item", "mercadoria", "catálogo"],
        },
        {
          href: `${basePath}/catalog/kits`,
          label: "Kits",
          icon: Boxes,
          keywords: ["kit", "combo", "conjunto"],
        },
        {
          href: `${basePath}/catalog/departments`,
          label: "Departamentos",
          icon: Layers,
          keywords: ["departamento", "seção", "setor"],
        },
        {
          href: `${basePath}/catalog/categories`,
          label: "Categorias",
          icon: FolderTree,
          keywords: ["categoria", "grupo"],
        },
        {
          href: `${basePath}/catalog/subcategories`,
          label: "Subcategorias",
          icon: ListTree,
          keywords: ["subcategoria", "sub-seção", "subgrupo"],
        },
        {
          href: `${basePath}/catalog/tags`,
          label: "Tags",
          icon: Tag,
          keywords: ["tag", "marcador", "rótulo"],
        },
        {
          href: `${basePath}/catalog/badges`,
          label: "Etiquetas",
          icon: Award,
          keywords: ["etiqueta", "selo", "badge", "destaque"],
        },
      ],
    },
    {
      label: "Relacionamento",
      items: [
        {
          href: `${basePath}/customers`,
          label: "Clientes",
          icon: Users,
          keywords: ["cliente", "comprador", "consumidor", "pessoa"],
        },
        {
          href: `${basePath}/coupons`,
          label: "Cupons",
          icon: Ticket,
          keywords: ["cupom", "desconto", "promoção", "voucher", "código"],
        },
        {
          href: `${basePath}/audit`,
          label: "Auditoria",
          icon: ScrollText,
          keywords: ["auditoria", "histórico", "log", "registro", "atividade"],
        },
      ],
    },
    {
      label: "Sistema",
      items: [
        {
          href: `${basePath}/integrations`,
          label: "Integrações",
          icon: Puzzle,
          keywords: ["integração", "conector", "api", "mcp"],
        },
      ],
    },
  ];
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function searchNavPages(q: string, basePath: string): NavPage[] {
  const pages: Array<NavPage & { keywords: string[] }> = [
    ...navGroups(basePath).flatMap((group) =>
      group.items.map((item) => ({
        label: item.label,
        href: item.href,
        keywords: item.keywords,
      })),
    ),
    ...SETTINGS_CHILDREN.map((child) => ({
      label: child.label,
      href: `${basePath}/settings/${child.href}`,
      section: "Configurações",
      keywords: child.keywords,
    })),
  ];

  const query = normalize(q.trim());

  const matched =
    query.length < 2
      ? pages
      : pages.filter((page) =>
          [page.label, ...page.keywords].some((term) => normalize(term).includes(query)),
        );

  return matched.map(({ label, href, section }) => ({ label, href, section }));
}
