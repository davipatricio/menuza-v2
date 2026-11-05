//! The admin MCP tool catalog, ported from `apps/tenant/src/mcp/tools.ts`.
//!
//! One list names every read the dashboard already serves: the capability the
//! caller's role must hold for the tool to be listed, the JSON schema the call
//! is validated against, and the persistence function plus `pub(crate)` panel
//! mapper it runs. The list is filtered by the grant's roles with the same
//! `can` map the panel enforces, so a `staff` token never sees a tool the call
//! would refuse.
//!
//! Tools call persistence and the panel's row→DTO mappers directly — never an
//! axum handler and never the router. An MCP call has already been
//! authenticated by [`crate::mcp::server`], so reaching a handler would mean
//! forging a session to get back to the place the request started. The store is
//! the one the bearer grant already covers, matched by the `storeSlug`
//! argument; no argument can name a tenant outside that grant.

use std::collections::{HashMap, HashSet};

use contract::ErrorCode;
use contract::mcp::{
    McpCategoriesListInput, McpCreateCouponInput, McpCreateProductInput, McpCustomerIdInput,
    McpDepartmentsListInput, McpOrderIdInput, McpOrderTransitionInput, McpOrdersListInput,
    McpProductIdInput, McpProductsListInput, McpSeoEntitiesInput, McpStoreInput, McpTagsListInput,
    McpUpdateProductInput, categories_list_schema, coupon_create_schema, customer_id_schema,
    departments_list_schema, order_id_schema, order_transition_schema, orders_list_schema,
    product_create_schema, product_id_schema, product_update_schema, products_list_schema,
    seo_entities_schema, store_schema, tags_list_schema,
};
use contract::tenant::panel::audit::PanelAuditLogsOutput;
use contract::tenant::panel::categories::PanelCategoriesOutput;
use contract::tenant::panel::coupons::PanelCouponOutput;
use contract::tenant::panel::coupons::PanelCouponsOutput;
use contract::tenant::panel::customers::{PanelCustomerOutput, PanelCustomersOutput};
use contract::tenant::panel::departments::PanelDepartmentsOutput;
use contract::tenant::panel::orders::{PanelOrderOutput, PanelOrderStateOutput, PanelOrdersOutput};
use contract::tenant::panel::products::{
    PanelProductOutput, PanelProductSuccess, PanelProductsOutput, SORT_FIELDS,
};
use contract::tenant::panel::seo::{SEO_ENTITY_TYPES, SeoEntityList, SeoEntityType};
use contract::tenant::panel::tags::PanelTagsOutput;
use persistence::commerce::orders;
use persistence::tenant::panel::audit::audit_log_list;
use persistence::tenant::panel::categories::{CategoryFilter, category_departments, category_list};
use persistence::tenant::panel::coupons::{
    coupon_code_taken, coupon_create as coupon_insert, coupon_find, coupon_links, coupon_list,
};
use persistence::tenant::panel::customers::{customer_list, customer_orders, customer_row};
use persistence::tenant::panel::departments::{DepartmentFilter, department_list};
use persistence::tenant::panel::orders::{event_actors, order_list, order_panel_fields};
use persistence::tenant::panel::products::{
    ProductDeleteOutcome, ProductFilter, ProductSeoRow, ProductWrite, ProductWriteOutcome,
    SubcategoryLink, VariationWrite, product_badges, product_create as product_insert,
    product_delete as product_remove, product_departments, product_detail, product_list,
    product_seo, product_subcategories, product_tags, product_update as product_amend,
    product_variations,
};
use persistence::tenant::panel::seo::{NamedEntity, seo_entity_names, seo_override_keys};
use persistence::tenant::panel::stores::store_read;
use persistence::tenant::panel::tags::tag_list;
use rmcp::ErrorData as McpError;
use rmcp::model::{CallToolRequestParams, CallToolResponse, CallToolResult, ContentBlock, Tool};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::domains::tenant::subdomains::panel::audit::panel_audit_log;
use crate::domains::tenant::subdomains::panel::categories::panel_category;
use crate::domains::tenant::subdomains::panel::coupons::{
    distinct, group_links, panel_coupon, prepare_write,
};
use crate::domains::tenant::subdomains::panel::customers::{
    panel_customer, panel_order as customer_order,
};
use crate::domains::tenant::subdomains::panel::departments::panel_department;
use crate::domains::tenant::subdomains::panel::orders::{
    capabilities, detail, panel_order, transitions,
};
use crate::domains::tenant::subdomains::panel::products::{
    cmp_number, cmp_text, group_badges, group_tags, group_variations, list_row, to_detail,
};
use crate::domains::tenant::subdomains::panel::seo::seo_entity_item;
use crate::domains::tenant::subdomains::panel::support::now;
use crate::domains::tenant::subdomains::panel::tags::panel_tag;
use crate::domains::tenant::support::{can, db_error};
use crate::mcp::server::{AllowedStore, McpHandler};

/// One entry as the endpoint serves it, after the grant narrowed the catalog.
pub struct ToolSpec {
    pub name: &'static str,
    pub description: &'static str,
    /// The input schema, with `storeSlug` removed when the grant covers one
    /// store — the call cannot mean anything else.
    pub input_schema: Value,
    /// The capability the caller's role must hold for this tool to be listed.
    pub capability: &'static str,
}

/// A catalog entry before it reaches a caller.
struct CatalogEntry {
    name: &'static str,
    description: &'static str,
    schema: fn() -> Value,
    capability: &'static str,
}

/// The 18 tools, in the order `tools.ts` listed them.
const TOOLS: [CatalogEntry; 18] = [
    CatalogEntry {
        name: "orders_list",
        description: "Lista os pedidos da loja, do mais recente ao mais antigo. Filtre por situação financeira, de atendimento ou forma de pagamento.",
        schema: orders_list_schema,
        capability: "orders:read",
    },
    CatalogEntry {
        name: "order_get",
        description: "Um pedido pelo código, com itens e a trilha de eventos.",
        schema: order_id_schema,
        capability: "orders:read",
    },
    CatalogEntry {
        name: "order_list_transitions",
        description: "As mudanças de estado permitidas para o pedido, nos eixos financeiro e de atendimento.",
        schema: order_id_schema,
        capability: "orders:read",
    },
    CatalogEntry {
        name: "order_transition",
        description: "Aplica uma transição de estado. Estornos exigem a capacidade orders:refund; algumas transições exigem motivo.",
        schema: order_transition_schema,
        capability: "orders:write",
    },
    CatalogEntry {
        name: "products_list",
        description: "O catálogo da loja com preço, categoria, estoque e tags.",
        schema: products_list_schema,
        capability: "dashboard:read",
    },
    CatalogEntry {
        name: "product_get",
        description: "Um produto pelo id, com variações, tags e nutrição.",
        schema: product_id_schema,
        capability: "dashboard:read",
    },
    CatalogEntry {
        name: "product_create",
        description: "Cria um produto com ao menos uma variação. Preços em centavos.",
        schema: product_create_schema,
        capability: "catalog:write",
    },
    CatalogEntry {
        name: "product_update",
        description: "Atualização parcial: campo omitido permanece, null limpa o valor. Enviar variations substitui a lista inteira, mantendo os ids enviados.",
        schema: product_update_schema,
        capability: "catalog:write",
    },
    CatalogEntry {
        name: "product_delete",
        description: "Remove um produto do catálogo.",
        schema: product_id_schema,
        capability: "catalog:write",
    },
    CatalogEntry {
        name: "customers_list",
        description: "Os clientes da loja com número de pedidos e total gasto.",
        schema: store_schema,
        capability: "dashboard:read",
    },
    CatalogEntry {
        name: "customer_get",
        description: "Um cliente pelo id, com seus pedidos.",
        schema: customer_id_schema,
        capability: "dashboard:read",
    },
    CatalogEntry {
        name: "coupons_list",
        description: "Os cupons da loja com limites e janela de validade.",
        schema: store_schema,
        capability: "dashboard:read",
    },
    CatalogEntry {
        name: "coupon_create",
        description: "Cria um cupom. discountValue é centavos quando discountType=fixed e porcentagem inteira quando percentage.",
        schema: coupon_create_schema,
        capability: "catalog:write",
    },
    CatalogEntry {
        name: "categories_list",
        description: "As categorias do catálogo com contagem de itens.",
        schema: categories_list_schema,
        capability: "dashboard:read",
    },
    CatalogEntry {
        name: "departments_list",
        description: "Os departamentos do catálogo com contagem de itens.",
        schema: departments_list_schema,
        capability: "dashboard:read",
    },
    CatalogEntry {
        name: "tags_list",
        description: "As tags do catálogo com contagem de itens.",
        schema: tags_list_schema,
        capability: "dashboard:read",
    },
    CatalogEntry {
        name: "seo_list_entities",
        description: "As entidades da loja que têm override de SEO.",
        schema: seo_entities_schema,
        capability: "seo:write",
    },
    CatalogEntry {
        name: "audit_list",
        description: "A trilha de auditoria da loja, do mais recente ao mais antigo.",
        schema: store_schema,
        capability: "dashboard:read",
    },
];

/// The catalog as one caller may see it.
///
/// The role filter is the same map the panel's procedures enforce. When the
/// caller's grant covers exactly one store, `storeSlug` is dropped from the
/// schema, so the caller cannot name a store it did not reach. This slice only
/// sees the enabled stores, so the caller passes the flag computed over the
/// whole grant — a store that never switched the integration on still counts.
pub fn list(grant: &[AllowedStore], single_store: bool) -> Vec<ToolSpec> {
    TOOLS
        .iter()
        .filter(|tool| grant.iter().any(|store| can(store.role, tool.capability)))
        .map(|tool| {
            let mut input_schema = (tool.schema)();

            if single_store {
                without_store_slug(&mut input_schema);
            }

            ToolSpec {
                name: tool.name,
                description: tool.description,
                input_schema,
                capability: tool.capability,
            }
        })
        .collect()
}

impl ToolSpec {
    /// The protocol shape this entry crosses the wire as.
    pub fn into_tool(self) -> Tool {
        let input_schema = self.input_schema.as_object().cloned().unwrap_or_default();

        Tool::new(self.name, self.description, input_schema)
    }
}

/// Drops `storeSlug` from `properties` and `required`.
fn without_store_slug(schema: &mut Value) {
    if let Some(properties) = schema.get_mut("properties").and_then(Value::as_object_mut) {
        properties.remove("storeSlug");
    }

    if let Some(required) = schema.get_mut("required").and_then(Value::as_array_mut) {
        required.retain(|key| key.as_str() != Some("storeSlug"));
    }
}

/// Runs one tool.
///
/// The catalog is rebuilt for the grant, so a tool the caller's role would not
/// list is unknown here too. Every failure is a caller-visible
/// [`CallToolResult::error`], exactly as the retired server's `textResult`
/// answered.
pub async fn call(
    handler: &McpHandler,
    request: CallToolRequestParams,
) -> Result<CallToolResponse, McpError> {
    let name = request.name.as_ref();
    let catalog = list(&handler.allowed, handler.single_store);

    let Some(tool) = catalog.iter().find(|tool| tool.name == name) else {
        return Ok(tool_error(format!("Ferramenta desconhecida: {name}")));
    };

    let args = Value::Object(request.arguments.unwrap_or_default());

    match run(handler, tool, args).await {
        Ok(output) => Ok(tool_success(output)),
        Err(message) => Ok(tool_error(message)),
    }
}

/// A tool payload as the MCP text content `JSON.stringify(output, null, 2)`
/// produced.
fn tool_success(output: Value) -> CallToolResponse {
    CallToolResult::success(vec![ContentBlock::text(
        serde_json::to_string_pretty(&output).unwrap_or_default(),
    )])
    .into()
}

fn tool_error(message: String) -> CallToolResponse {
    CallToolResult::error(vec![ContentBlock::text(message)]).into()
}

/// Dispatches one call, narrowing the input to the tool's own struct.
async fn run(handler: &McpHandler, tool: &ToolSpec, args: Value) -> Result<Value, String> {
    match tool.name {
        "orders_list" => {
            let input = parse::<McpOrdersListInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            orders_list(handler, store, input).await
        }
        "order_get" => {
            let input = parse::<McpOrderIdInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            order_get(handler, store, input).await
        }
        "order_list_transitions" => {
            let input = parse::<McpOrderIdInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            order_list_transitions(handler, store, input).await
        }
        "order_transition" => {
            let input = parse::<McpOrderTransitionInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            order_transition(handler, store, input).await
        }
        "products_list" => {
            let input = parse::<McpProductsListInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            products_list(handler, store, input).await
        }
        "product_get" => {
            let input = parse::<McpProductIdInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            product_get(handler, store, input).await
        }
        "product_create" => {
            let input = parse::<McpCreateProductInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            product_create(handler, store, input).await
        }
        "product_update" => {
            let input = parse::<McpUpdateProductInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            product_update(handler, store, input).await
        }
        "product_delete" => {
            let input = parse::<McpProductIdInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            product_delete(handler, store, input).await
        }
        "customers_list" => {
            let input = parse::<McpStoreInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            customers_list(handler, store).await
        }
        "customer_get" => {
            let input = parse::<McpCustomerIdInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            customer_get(handler, store, input).await
        }
        "coupons_list" => {
            let input = parse::<McpStoreInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            coupons_list(handler, store).await
        }
        "coupon_create" => {
            let input = parse::<McpCreateCouponInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            coupon_create(handler, store, input).await
        }
        "categories_list" => {
            let input = parse::<McpCategoriesListInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            categories_list(handler, store, input).await
        }
        "departments_list" => {
            let input = parse::<McpDepartmentsListInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            departments_list(handler, store, input).await
        }
        "tags_list" => {
            let input = parse::<McpTagsListInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            tags_list(handler, store, input).await
        }
        "seo_list_entities" => {
            let input = parse::<McpSeoEntitiesInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            seo_list_entities(handler, store, input).await
        }
        "audit_list" => {
            let input = parse::<McpStoreInput>(args)?;
            let store = scoped(handler, tool, input.store_slug.as_deref())?;

            audit_list(handler, store).await
        }
        _ => Err(format!("Ferramenta desconhecida: {}", tool.name)),
    }
}

/// Parses the call's arguments into the tool's own input struct.
fn parse<T: DeserializeOwned>(args: Value) -> Result<T, String> {
    serde_json::from_value(args).map_err(|_| ErrorCode::ValidationFailed.message().to_owned())
}

/// The store this call may read: the argument matched against the grant, or the
/// grant's only store. A slug outside the grant is `NOT_FOUND`, never a lookup.
fn scoped<'a>(
    handler: &'a McpHandler,
    tool: &ToolSpec,
    slug: Option<&str>,
) -> Result<&'a AllowedStore, String> {
    let store = match slug {
        Some(slug) => handler.allowed.iter().find(|store| store.slug == slug),
        None if handler.allowed.len() == 1 => handler.allowed.first(),
        None => None,
    };

    let store = store.ok_or_else(|| ErrorCode::NotFound.message().to_owned())?;

    // The listing already hid this tool from a role that lacks the capability;
    // the call re-checks the store it actually landed on, like the procedure.
    if !can(store.role, tool.capability) {
        return Err(ErrorCode::Forbidden.message().to_owned());
    }

    Ok(store)
}

/// A persistence failure as the catalog's internal error message.
fn db(error: sqlx::Error) -> String {
    db_error(error).0.message().to_owned()
}

fn not_found() -> String {
    ErrorCode::NotFound.message().to_owned()
}

fn validation() -> String {
    ErrorCode::ValidationFailed.message().to_owned()
}

fn output<T: Serialize>(value: T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|_| ErrorCode::Internal.message().to_owned())
}

/// The store's orders, newest first, with the optional closed filters.
async fn orders_list(
    handler: &McpHandler,
    store: &AllowedStore,
    input: McpOrdersListInput,
) -> Result<Value, String> {
    let rows = order_list(
        &handler.pool,
        &store.tenant,
        input.financial_status.as_deref(),
        input.fulfilment_status.as_deref(),
        input.payment_method.as_deref(),
    )
    .await
    .map_err(db)?;

    output(PanelOrdersOutput {
        orders: rows.into_iter().map(panel_order).collect(),
    })
}

/// One order by its human code, with lines and trail.
async fn order_get(
    handler: &McpHandler,
    store: &AllowedStore,
    input: McpOrderIdInput,
) -> Result<Value, String> {
    let row = orders::order_by_code(&handler.pool, &store.tenant, &input.order_code)
        .await
        .map_err(db)?
        .ok_or_else(not_found)?;

    let fields = order_panel_fields(&handler.pool, &store.tenant, &row.id)
        .await
        .map_err(db)?
        .ok_or_else(not_found)?;

    let items = orders::items(&handler.pool, &store.tenant, &row.id)
        .await
        .map_err(db)?;

    let events = orders::events(&handler.pool, &store.tenant, &row.id)
        .await
        .map_err(db)?;

    let actors = event_actors(&handler.pool, &store.tenant, &row.id)
        .await
        .map_err(db)?
        .into_iter()
        .map(|actor| (actor.event_id, actor.actor_name))
        .collect::<HashMap<_, _>>();

    output(PanelOrderOutput {
        order: detail(
            row,
            &fields.customer_name,
            fields.created_at,
            items,
            events,
            &actors,
        ),
    })
}

/// The legal moves on both axes for the caller's role.
async fn order_list_transitions(
    handler: &McpHandler,
    store: &AllowedStore,
    input: McpOrderIdInput,
) -> Result<Value, String> {
    let row = orders::order_by_code(&handler.pool, &store.tenant, &input.order_code)
        .await
        .map_err(db)?
        .ok_or_else(not_found)?;

    output(
        contract::tenant::panel::orders::PanelOrderTransitionsOutput {
            transitions: transitions(
                &row.financial_status,
                &row.fulfilment_status,
                &capabilities(store.role),
            ),
        },
    )
}

/// The catalog, merged the way the table draws it.
async fn products_list(
    handler: &McpHandler,
    store: &AllowedStore,
    input: McpProductsListInput,
) -> Result<Value, String> {
    let sort_by = input.sort_by.as_deref().unwrap_or("sortOrder");
    let order = input.order.as_deref().unwrap_or("asc");

    if !SORT_FIELDS.contains(&sort_by) || !matches!(order, "asc" | "desc") {
        return Err(validation());
    }

    let filter = ProductFilter { sort_by, order };
    let desc = order == "desc";

    let rows = product_list(&handler.pool, &store.tenant, &filter)
        .await
        .map_err(db)?;

    let mut variations = group_variations(
        product_variations(&handler.pool, &store.tenant)
            .await
            .map_err(db)?,
    );

    let mut tags = group_tags(
        product_tags(&handler.pool, &store.tenant)
            .await
            .map_err(db)?,
    );

    let mut badges = group_badges(
        product_badges(&handler.pool, &store.tenant)
            .await
            .map_err(db)?,
    );

    let subcategories: HashMap<String, SubcategoryLink> =
        product_subcategories(&handler.pool, &store.tenant)
            .await
            .map_err(db)?
            .into_iter()
            .map(|link| (link.subcategory_id.clone(), link))
            .collect();

    let mut departments: HashMap<String, Vec<(String, String)>> = HashMap::new();

    for link in product_departments(&handler.pool, &store.tenant)
        .await
        .map_err(db)?
    {
        departments
            .entry(link.category_id)
            .or_default()
            .push((link.department_id, link.department_name));
    }

    let seo: HashMap<String, ProductSeoRow> = product_seo(&handler.pool, &store.tenant)
        .await
        .map_err(db)?
        .into_iter()
        .map(|row| (row.entity_id.clone(), row))
        .collect();

    let mut products = rows
        .into_iter()
        .map(|row| {
            let id = row.id.clone();

            list_row(
                row,
                variations.remove(&id).unwrap_or_default(),
                tags.remove(&id).unwrap_or_default(),
                badges.remove(&id).unwrap_or_default(),
                &subcategories,
                &departments,
                seo.get(&id),
            )
        })
        .collect::<Vec<_>>();

    match sort_by {
        "price" => products.sort_by(|a, b| {
            cmp_number(a.price_min_cents, b.price_min_cents, desc)
                .then_with(|| a.name.cmp(&b.name))
                .then_with(|| a.id.cmp(&b.id))
        }),
        "category" => products.sort_by(|a, b| {
            cmp_text(a.category_name.as_deref(), b.category_name.as_deref(), desc)
                .then_with(|| a.name.cmp(&b.name))
                .then_with(|| a.id.cmp(&b.id))
        }),
        "stock" => products.sort_by(|a, b| {
            cmp_number(a.stock_qty, b.stock_qty, desc)
                .then_with(|| a.name.cmp(&b.name))
                .then_with(|| a.id.cmp(&b.id))
        }),
        _ => {}
    }

    output(PanelProductsOutput { products })
}

/// One product by id, with variations, tags and nutrition.
async fn product_get(
    handler: &McpHandler,
    store: &AllowedStore,
    input: McpProductIdInput,
) -> Result<Value, String> {
    let Some(row) = product_detail(&handler.pool, &store.tenant, &input.product_id)
        .await
        .map_err(db)?
    else {
        return Err(not_found());
    };

    output(PanelProductOutput {
        product: to_detail(row),
    })
}

/// Every customer of the store, with order count and total spent.
async fn customers_list(handler: &McpHandler, store: &AllowedStore) -> Result<Value, String> {
    let rows = customer_list(&handler.pool, &store.tenant)
        .await
        .map_err(db)?;

    output(PanelCustomersOutput {
        customers: rows.into_iter().map(panel_customer).collect(),
    })
}

/// One customer by id, plus their orders.
async fn customer_get(
    handler: &McpHandler,
    store: &AllowedStore,
    input: McpCustomerIdInput,
) -> Result<Value, String> {
    let Some(row) = customer_row(&handler.pool, &store.tenant, &input.customer_id)
        .await
        .map_err(db)?
    else {
        return Err(not_found());
    };

    let orders = customer_orders(&handler.pool, &store.tenant, &input.customer_id)
        .await
        .map_err(db)?
        .into_iter()
        .map(customer_order)
        .collect();

    output(PanelCustomerOutput {
        customer: panel_customer(row),
        orders,
    })
}

/// The store's coupons plus their product scope.
async fn coupons_list(handler: &McpHandler, store: &AllowedStore) -> Result<Value, String> {
    let rows = coupon_list(&handler.pool, &store.tenant)
        .await
        .map_err(db)?;

    let ids = rows.iter().map(|row| row.id.clone()).collect::<Vec<_>>();

    let links = coupon_links(&handler.pool, &store.tenant, &ids)
        .await
        .map_err(db)?;

    let mut product_ids = group_links(links);

    let coupons = rows
        .into_iter()
        .map(|row| {
            let product_ids = product_ids.remove(&row.id).unwrap_or_default();

            panel_coupon(&row, product_ids, Vec::new())
        })
        .collect();

    output(PanelCouponsOutput { coupons })
}

/// Categories with their item counts and department links.
async fn categories_list(
    handler: &McpHandler,
    store: &AllowedStore,
    input: McpCategoriesListInput,
) -> Result<Value, String> {
    let filter = CategoryFilter {
        term: input.q.as_deref().unwrap_or("").trim(),
        status: input.status.as_deref().unwrap_or(""),
        department_id: input.department_id.as_deref().unwrap_or(""),
        sort_by: input.sort_by.as_deref().unwrap_or(""),
        order: input.order.as_deref().unwrap_or(""),
    };

    let rows = category_list(&handler.pool, &store.tenant, &filter)
        .await
        .map_err(db)?;

    let links = category_departments(&handler.pool, &store.tenant)
        .await
        .map_err(db)?;

    let mut department_ids: HashMap<String, Vec<String>> = HashMap::new();
    let mut department_names: HashMap<String, Vec<String>> = HashMap::new();

    for link in links {
        department_ids
            .entry(link.category_id.clone())
            .or_default()
            .push(link.department_id);
        department_names
            .entry(link.category_id)
            .or_default()
            .push(link.department_name);
    }

    let categories = rows
        .into_iter()
        .map(|row| {
            let id = row.id.clone();

            panel_category(
                row,
                department_ids.remove(&id).unwrap_or_default(),
                department_names.remove(&id).unwrap_or_default(),
            )
        })
        .collect();

    output(PanelCategoriesOutput { categories })
}

/// Departments with their item counts.
async fn departments_list(
    handler: &McpHandler,
    store: &AllowedStore,
    input: McpDepartmentsListInput,
) -> Result<Value, String> {
    let filter = DepartmentFilter {
        term: input.q.as_deref().unwrap_or("").trim(),
        status: input.status.as_deref().unwrap_or(""),
        sort_by: input.sort_by.as_deref().unwrap_or(""),
        order: input.order.as_deref().unwrap_or(""),
    };

    let rows = department_list(&handler.pool, &store.tenant, &filter)
        .await
        .map_err(db)?;

    output(PanelDepartmentsOutput {
        departments: rows.into_iter().map(panel_department).collect(),
    })
}

/// Tags with their item counts.
async fn tags_list(
    handler: &McpHandler,
    store: &AllowedStore,
    input: McpTagsListInput,
) -> Result<Value, String> {
    let rows = tag_list(
        &handler.pool,
        &store.tenant,
        input.sort_by.as_deref().unwrap_or(""),
        input.order.as_deref().unwrap_or(""),
    )
    .await
    .map_err(db)?;

    output(PanelTagsOutput {
        tags: rows.into_iter().map(panel_tag).collect(),
    })
}

/// The store's entities and whether each one carries an SEO override.
async fn seo_list_entities(
    handler: &McpHandler,
    store: &AllowedStore,
    input: McpSeoEntitiesInput,
) -> Result<Value, String> {
    let types = match input.entity_type.as_deref() {
        Some(raw) => vec![SeoEntityType::parse(raw).ok_or_else(validation)?],
        None => SEO_ENTITY_TYPES.to_vec(),
    };

    let store_name = store_read(&handler.pool, &store.tenant)
        .await
        .map_err(db)?
        .map(|store| store.display_name)
        .ok_or_else(not_found)?;

    let overrides: HashSet<(SeoEntityType, String)> =
        seo_override_keys(&handler.pool, &store.tenant)
            .await
            .map_err(db)?
            .into_iter()
            .collect();

    let mut entities = Vec::new();

    for entity_type in types {
        let rows = if entity_type == SeoEntityType::Store {
            vec![NamedEntity {
                id: store.tenant.as_str().to_owned(),
                name: store_name.clone(),
            }]
        } else {
            seo_entity_names(&handler.pool, &store.tenant, entity_type)
                .await
                .map_err(db)?
        };

        for row in rows {
            let has_override = overrides.contains(&(entity_type, row.id.clone()));

            entities.push(seo_entity_item(entity_type, has_override, row));
        }
    }

    output(SeoEntityList { entities })
}

/// The store's audit trail, newest first.
async fn audit_list(handler: &McpHandler, store: &AllowedStore) -> Result<Value, String> {
    let rows = audit_log_list(&handler.pool, &store.tenant)
        .await
        .map_err(db)?;

    output(PanelAuditLogsOutput {
        logs: rows.into_iter().map(panel_audit_log).collect(),
    })
}

/// Applies one order transition, with the refund capability checked on its own.
async fn order_transition(
    handler: &McpHandler,
    store: &AllowedStore,
    input: McpOrderTransitionInput,
) -> Result<Value, String> {
    let order_code = input.order_code.clone();
    let panel_input = input.into_input();
    panel_input
        .validate()
        .map_err(|code| code.message().to_owned())?;

    // A refund is the narrower capability; every other move takes the write.
    let capability = if panel_input.to == "refunded" {
        "orders:refund"
    } else {
        "orders:write"
    };

    if !can(store.role, capability) {
        return Err(ErrorCode::Forbidden.message().to_owned());
    }

    let capabilities = capabilities(store.role);

    let actor = orders::TransitionActor {
        capabilities: &capabilities,
        member_id: Some(handler.member_id.as_str()),
    };

    let output = orders::transition(
        &handler.pool,
        &store.tenant,
        &order_code,
        panel_input.axis,
        &panel_input.to,
        panel_input.reason.as_deref(),
        actor,
    )
    .await
    .map_err(order_error)?;

    self::output(PanelOrderStateOutput {
        financial_status: output.financial_status.clone(),
        fulfilment_status: output.fulfilment_status.clone(),
        transitions: transitions(
            &output.financial_status,
            &output.fulfilment_status,
            &capabilities,
        ),
    })
}

/// Creates a product, its variations and its links, then answers with the row.
async fn product_create(
    handler: &McpHandler,
    store: &AllowedStore,
    input: McpCreateProductInput,
) -> Result<Value, String> {
    let input = input.into_input();
    input.validate().map_err(|code| code.message().to_owned())?;

    let variations = input
        .variations
        .iter()
        .map(|variation| VariationWrite {
            id: variation.id.as_deref(),
            name: variation.name.trim(),
            price_cents: variation.price_cents,
            stock_mode: variation.stock_mode.as_str(),
            stock_qty: variation.stock_qty,
        })
        .collect::<Vec<_>>();

    let product_id = uuid::Uuid::new_v4().to_string();

    let outcome = product_insert(
        &handler.pool,
        &store.tenant,
        &product_id,
        &ProductWrite {
            name: input.name.trim(),
            description: input.description.as_deref(),
            subcategory_id: input.subcategory_id.as_deref(),
            available: input.available,
            archived: input.archived.unwrap_or(false),
            hidden: input.hidden.unwrap_or(false),
            private: input.private.unwrap_or(false),
            sort_order: input.sort_order,
        },
        &variations,
        &input.tag_ids,
        input.badge_ids.as_deref().unwrap_or(&[]),
        now(),
    )
    .await
    .map_err(db)?;

    if outcome == ProductWriteOutcome::MissingReference {
        return Err(not_found());
    }

    product_response(handler, store, &product_id).await
}

/// Applies a partial product update, keeping every omitted field.
async fn product_update(
    handler: &McpHandler,
    store: &AllowedStore,
    input: McpUpdateProductInput,
) -> Result<Value, String> {
    let product_id = input.product_id.clone();
    let input = input.into_input();
    input.validate().map_err(|code| code.message().to_owned())?;

    let Some(existing) = product_detail(&handler.pool, &store.tenant, &product_id)
        .await
        .map_err(db)?
    else {
        return Err(not_found());
    };

    let existing_ids: HashSet<String> = existing
        .variations
        .iter()
        .map(|variation| variation.id.clone())
        .collect();

    let mut removed_ids = Vec::new();

    if let Some(variations) = &input.variations {
        let kept = variations
            .iter()
            .filter_map(|variation| variation.id.as_deref())
            .collect::<HashSet<_>>();

        // A variation id the product does not own cannot be updated or removed.
        for id in &kept {
            if !existing_ids.contains(*id) {
                return Err(not_found());
            }
        }

        removed_ids = existing_ids
            .iter()
            .filter(|id| !kept.contains(id.as_str()))
            .cloned()
            .collect();
    }

    let variations = input.variations.as_ref().map(|list| {
        list.iter()
            .map(|variation| VariationWrite {
                id: variation.id.as_deref(),
                name: variation.name.trim(),
                price_cents: variation.price_cents,
                stock_mode: variation.stock_mode.as_str(),
                stock_qty: variation.stock_qty,
            })
            .collect::<Vec<_>>()
    });

    let outcome = product_amend(
        &handler.pool,
        &store.tenant,
        &product_id,
        &ProductWrite {
            name: input
                .name
                .as_deref()
                .unwrap_or(&existing.product.name)
                .trim(),
            description: match &input.description {
                Some(value) => value.as_deref(),
                None => existing.product.description.as_deref(),
            },
            subcategory_id: match &input.subcategory_id {
                Some(value) => value.as_deref(),
                None => existing.product.subcategory_id.as_deref(),
            },
            available: input.available.unwrap_or(existing.product.available),
            archived: input.archived.unwrap_or(existing.product.archived),
            hidden: input.hidden.unwrap_or(existing.product.hidden),
            private: input.private.unwrap_or(existing.product.private),
            sort_order: input.sort_order.unwrap_or(existing.product.sort_order),
        },
        variations.as_deref(),
        &removed_ids,
        input.tag_ids.as_deref(),
        input.badge_ids.as_deref(),
        now(),
    )
    .await
    .map_err(db)?;

    match outcome {
        ProductWriteOutcome::Updated => {}
        ProductWriteOutcome::MissingReference => return Err(not_found()),
        ProductWriteOutcome::VariationInUse => {
            return Err("Variação em uso por um kit ou pedido; não pode ser removida.".to_owned());
        }
    }

    product_response(handler, store, &product_id).await
}

/// Deletes a product no order or kit points at.
async fn product_delete(
    handler: &McpHandler,
    store: &AllowedStore,
    input: McpProductIdInput,
) -> Result<Value, String> {
    match product_remove(&handler.pool, &store.tenant, &input.product_id)
        .await
        .map_err(db)?
    {
        ProductDeleteOutcome::Deleted => output(PanelProductSuccess { success: true }),
        ProductDeleteOutcome::Missing => Err(not_found()),
        ProductDeleteOutcome::InUse => {
            Err("Produto em uso por um kit ou pedido; não pode ser removido.".to_owned())
        }
    }
}

/// The stored product after a write, so the answer is the row and not the input.
async fn product_response(
    handler: &McpHandler,
    store: &AllowedStore,
    product_id: &str,
) -> Result<Value, String> {
    let Some(row) = product_detail(&handler.pool, &store.tenant, product_id)
        .await
        .map_err(db)?
    else {
        return Err(not_found());
    };

    output(PanelProductOutput {
        product: to_detail(row),
    })
}

/// Creates a coupon and answers with the stored row.
async fn coupon_create(
    handler: &McpHandler,
    store: &AllowedStore,
    input: McpCreateCouponInput,
) -> Result<Value, String> {
    let input = input.into_input();
    input.validate().map_err(|code| code.message().to_owned())?;

    let product_ids = distinct(&input.product_ids);
    let coupon_id = uuid::Uuid::new_v4().to_string();
    let code = input.code.trim().to_uppercase();
    let write = prepare_write(&input, &code, &product_ids, &input.kit_ids)
        .map_err(|error| error.0.message().to_owned())?;

    if coupon_code_taken(&handler.pool, &store.tenant, write.code)
        .await
        .map_err(db)?
    {
        return Err("Já existe um cupom com este código nesta loja.".to_owned());
    }

    let created = coupon_insert(&handler.pool, &store.tenant, &coupon_id, &write)
        .await
        .map_err(db)?;

    if !created {
        return Err(not_found());
    }

    let Some(row) = coupon_find(&handler.pool, &store.tenant, &coupon_id)
        .await
        .map_err(db)?
    else {
        return Err(ErrorCode::Internal.message().to_owned());
    };

    let product_ids = coupon_links(&handler.pool, &store.tenant, &[coupon_id])
        .await
        .map_err(db)?
        .into_iter()
        .map(|link| link.product_id)
        .collect();

    output(PanelCouponOutput {
        coupon: panel_coupon(&row, product_ids, Vec::new()),
    })
}

/// A refused order write as the catalog message the client switches on.
fn order_error(error: orders::OrderError) -> String {
    match error {
        orders::OrderError::NotFound => ErrorCode::NotFound.message().to_owned(),
        orders::OrderError::Invalid { .. } => ErrorCode::Conflict.message().to_owned(),
        orders::OrderError::Forbidden => ErrorCode::Forbidden.message().to_owned(),
        orders::OrderError::ReasonRequired => ErrorCode::ValidationFailed.message().to_owned(),
        orders::OrderError::Db(_) => ErrorCode::Internal.message().to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domains::tenant::support::TenantRole;
    use persistence::tenant::TenantId;

    fn store(slug: &str) -> AllowedStore {
        AllowedStore {
            tenant: TenantId::parse(slug).expect("tenant id"),
            slug: slug.to_owned(),
            role: TenantRole::Owner,
        }
    }

    fn carries_store_slug(tool: &ToolSpec) -> bool {
        tool.input_schema["properties"]
            .as_object()
            .is_some_and(|properties| properties.contains_key("storeSlug"))
    }

    /// Two stores granted, one enabled: the enabled slice is one entry, but the
    /// caller can still name the other, so `storeSlug` must stay.
    #[test]
    fn store_slug_follows_the_whole_grant_not_the_enabled_slice() {
        let enabled = [store("only-enabled")];

        assert!(list(&enabled, false).iter().all(carries_store_slug));
        assert!(
            list(&enabled, true)
                .iter()
                .all(|tool| !carries_store_slug(tool))
        );
    }
}
