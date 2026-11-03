//! seo resource: panel routes.
//!
//! Two levels share the same resolution: the store-wide templates
//! (`/seo`) and one override row per entity (`/seo/{entityType}/{entityId}`).
//! Every read resolves field by field through `domain::seo`, so an inherited
//! field is labelled with the level that won instead of reading as empty.

use std::collections::HashSet;

use axum::Json;
use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use contract::ErrorCode;
use contract::tenant::panel::seo::{
    EntitySeoOutput, ListSeoEntitiesInput, PanelResolvedSeo, PanelSeoSource, SEO_ENTITY_TYPES,
    SaveSeoInput, SaveStoreSeoInput, SeoEntityItem, SeoEntityList, SeoEntityType, SeoFields,
    SeoSourceLevel, StoreSeoOutput, StoreSeoSettings,
};
use domain::seo::{
    ResolvedSeo, SeoContext, SeoInput, SeoMetaRow, SeoSource, StoreSeoDefaults, resolve_seo,
};
use persistence::tenant::TenantId;
use persistence::tenant::panel::seo::{
    NamedEntity, SeoFieldsWrite, seo_entity_name, seo_entity_names, seo_meta_delete, seo_meta_find,
    seo_meta_upsert, seo_override_keys, store_seo_defaults, store_seo_defaults_upsert,
};
use persistence::tenant::panel::stores::store_read;

use super::support::{PanelContext, context, guard, now};
use crate::domains::tenant::support::{ApiError, db_error};

/// Routes this resource owns.
pub fn router() -> axum::Router<crate::State> {
    axum::Router::new()
        .route(
            "/panel/stores/{storeSlug}/seo",
            axum::routing::get(get_store_seo).put(save_store_seo),
        )
        .route(
            "/panel/stores/{storeSlug}/seo/entities",
            axum::routing::get(list_seo_entities),
        )
        .route(
            "/panel/stores/{storeSlug}/seo/{entityType}/{entityId}",
            axum::routing::get(get_seo).put(save_seo).delete(revert_seo),
        )
}

/// Paths this resource contributes to the panel document.
pub fn openapi() -> utoipa::openapi::OpenApi {
    #[derive(utoipa::OpenApi)]
    #[openapi(
        paths(
            get_store_seo,
            save_store_seo,
            list_seo_entities,
            get_seo,
            save_seo,
            revert_seo
        ),
        components(schemas(
            contract::tenant::panel::seo::StoreSeoSettings,
            contract::tenant::panel::seo::StoreSeoOutput,
            contract::tenant::panel::seo::SaveStoreSeoInput,
            contract::tenant::panel::seo::PanelSeoSource,
            contract::tenant::panel::seo::PanelResolvedSeo,
            contract::tenant::panel::seo::SeoFields,
            contract::tenant::panel::seo::EntitySeoOutput,
            contract::tenant::panel::seo::SaveSeoInput,
            contract::tenant::panel::seo::SeoEntityType,
            contract::tenant::panel::seo::SeoSourceLevel,
            contract::tenant::panel::seo::SeoEntityItem,
            contract::tenant::panel::seo::SeoEntityList,
            contract::tenant::panel::seo::ListSeoEntitiesInput
        ))
    )]
    struct Api;

    use utoipa::OpenApi as _;

    Api::openapi()
}

/// The store's templates plus the values a page inherits from them.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/seo",
    operation_id = "getPanelStoreSeo",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    responses(
        (status = 200, body = StoreSeoOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_store_seo(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
) -> Result<Json<StoreSeoOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "dashboard:read")?;

    let store_name = store_name(&state, &ctx.tenant).await?;
    let settings = store_seo_defaults(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?;

    let output = resolve_with(
        &state,
        &ctx,
        &store_name,
        SeoEntityType::Store,
        ctx.tenant.as_str(),
        &store_name,
        settings.clone(),
    )
    .await?;

    Ok(Json(StoreSeoOutput {
        settings: settings_dto(settings),
        resolved: output.resolved,
    }))
}

/// Writes the store-level templates. One row per tenant, so the write is an
/// upsert and two admin tabs cannot lose each other's save.
#[utoipa::path(
    put,
    path = "/panel/stores/{storeSlug}/seo",
    operation_id = "savePanelStoreSeo",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug.")
    ),
    request_body = SaveStoreSeoInput,
    responses(
        (status = 200, body = StoreSeoOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn save_store_seo(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Json(input): Json<SaveStoreSeoInput>,
) -> Result<Json<StoreSeoOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "seo:write")?;
    input.validate().map_err(ApiError)?;

    let settings = StoreSeoSettings {
        seo_title_template: seo_text(input.seo_title_template),
        seo_description_template: seo_text(input.seo_description_template),
        seo_social_image_url: seo_text(input.seo_social_image_url),
    };

    let defaults = StoreSeoDefaults {
        seo_title_template: settings.seo_title_template.clone(),
        seo_description_template: settings.seo_description_template.clone(),
        seo_social_image_url: settings.seo_social_image_url.clone(),
    };

    store_seo_defaults_upsert(&state.pool, &ctx.tenant, &defaults, now())
        .await
        .map_err(db_error)?;

    let store_name = store_name(&state, &ctx.tenant).await?;

    let output = resolve_with(
        &state,
        &ctx,
        &store_name,
        SeoEntityType::Store,
        ctx.tenant.as_str(),
        &store_name,
        Some(defaults),
    )
    .await?;

    Ok(Json(StoreSeoOutput {
        settings,
        resolved: output.resolved,
    }))
}

/// Every entity of the requested type with its override flag.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/seo/entities",
    operation_id = "listPanelSeoEntities",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("entityType" = Option<SeoEntityType>, Query, description = "One type, or every type when omitted.")
    ),
    responses(
        (status = 200, body = SeoEntityList),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn list_seo_entities(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path(store_slug): Path<String>,
    Query(query): Query<ListSeoEntitiesInput>,
) -> Result<Json<SeoEntityList>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "dashboard:read")?;

    let types = match query.entity_type.as_deref() {
        Some(raw) => vec![entity_type(raw)?],
        None => SEO_ENTITY_TYPES.to_vec(),
    };

    let store_name = store_name(&state, &ctx.tenant).await?;

    let overrides: HashSet<(SeoEntityType, String)> = seo_override_keys(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?
        .into_iter()
        .collect();

    let mut entities = Vec::new();

    for entity_type in types {
        let rows = if entity_type == SeoEntityType::Store {
            vec![NamedEntity {
                id: ctx.tenant.as_str().to_owned(),
                name: store_name.clone(),
            }]
        } else {
            seo_entity_names(&state.pool, &ctx.tenant, entity_type)
                .await
                .map_err(db_error)?
        };

        for row in rows {
            let has_override = overrides.contains(&(entity_type, row.id.clone()));

            entities.push(seo_entity_item(entity_type, has_override, row));
        }
    }

    Ok(Json(SeoEntityList { entities }))
}

/// The entity as the SEO list reads it.
/// MCP reuses this: the tool maps the same entity rows.
pub(crate) fn seo_entity_item(
    entity_type: SeoEntityType,
    has_override: bool,
    row: NamedEntity,
) -> SeoEntityItem {
    SeoEntityItem {
        entity_type,
        has_override,
        entity_id: row.id,
        name: row.name,
    }
}

/// One entity's saved override plus the values a page would render.
#[utoipa::path(
    get,
    path = "/panel/stores/{storeSlug}/seo/{entityType}/{entityId}",
    operation_id = "getPanelSeo",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("entityType" = SeoEntityType, Path, description = "The kind of page the override describes."),
        ("entityId" = String, Path, description = "The entity's id inside the store.")
    ),
    responses(
        (status = 200, body = EntitySeoOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn get_seo(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, entity_type_slug, entity_id)): Path<(String, String, String)>,
) -> Result<Json<EntitySeoOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "dashboard:read")?;

    let entity_type = entity_type(&entity_type_slug)?;
    let store_name = store_name(&state, &ctx.tenant).await?;
    let entity_name = entity_name(&state, &ctx, entity_type, &entity_id, &store_name).await?;

    Ok(Json(
        resolve_entity(
            &state,
            &ctx,
            &store_name,
            entity_type,
            &entity_id,
            &entity_name,
        )
        .await?,
    ))
}

/// Saves one entity's override, partially: an omitted field keeps the stored
/// value and `null` reverts that field. A row left with no field is deleted.
#[utoipa::path(
    put,
    path = "/panel/stores/{storeSlug}/seo/{entityType}/{entityId}",
    operation_id = "savePanelSeo",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("entityType" = SeoEntityType, Path, description = "The kind of page the override describes."),
        ("entityId" = String, Path, description = "The entity's id inside the store.")
    ),
    request_body = SaveSeoInput,
    responses(
        (status = 200, body = EntitySeoOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn save_seo(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, entity_type_slug, entity_id)): Path<(String, String, String)>,
    Json(input): Json<SaveSeoInput>,
) -> Result<Json<EntitySeoOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "seo:write")?;
    input.validate().map_err(ApiError)?;

    let entity_type = entity_type(&entity_type_slug)?;
    let store_name = store_name(&state, &ctx.tenant).await?;
    let entity_name = entity_name(&state, &ctx, entity_type, &entity_id, &store_name).await?;

    let existing = seo_meta_find(&state.pool, &ctx.tenant, entity_type, &entity_id)
        .await
        .map_err(db_error)?;

    let fields = SeoFieldsWrite {
        title: merge(
            input.title,
            existing.as_ref().and_then(|row| row.title.clone()),
        ),
        description: merge(
            input.description,
            existing.as_ref().and_then(|row| row.description.clone()),
        ),
        canonical_url: merge(
            input.canonical_url,
            existing.as_ref().and_then(|row| row.canonical_url.clone()),
        ),
        social_image_url: merge(
            input.social_image_url,
            existing
                .as_ref()
                .and_then(|row| row.social_image_url.clone()),
        ),
        json_ld: merge(
            input.json_ld,
            existing.as_ref().and_then(|row| row.json_ld.clone()),
        ),
    };

    if fields.is_empty() {
        seo_meta_delete(&state.pool, &ctx.tenant, entity_type, &entity_id)
            .await
            .map_err(db_error)?;
    } else {
        seo_meta_upsert(&state.pool, &ctx.tenant, entity_type, &entity_id, &fields)
            .await
            .map_err(db_error)?;
    }

    Ok(Json(
        resolve_entity(
            &state,
            &ctx,
            &store_name,
            entity_type,
            &entity_id,
            &entity_name,
        )
        .await?,
    ))
}

/// Drops the whole override row, which is what "Reverter tudo" asks for. An
/// entity that was never saved is a no-op, not a `NOT_FOUND`.
#[utoipa::path(
    delete,
    path = "/panel/stores/{storeSlug}/seo/{entityType}/{entityId}",
    operation_id = "revertPanelSeo",
    tag = "panel",
    params(
        ("storeSlug" = String, Path, description = "The store's public slug."),
        ("entityType" = SeoEntityType, Path, description = "The kind of page the override describes."),
        ("entityId" = String, Path, description = "The entity's id inside the store.")
    ),
    responses(
        (status = 200, body = EntitySeoOutput),
        (status = 400, body = contract::ApiErrorBody),
        (status = 401, body = contract::ApiErrorBody),
        (status = 403, body = contract::ApiErrorBody),
        (status = 404, body = contract::ApiErrorBody),
        (status = 409, body = contract::ApiErrorBody),
        (status = 500, body = contract::ApiErrorBody)
    )
)]
pub async fn revert_seo(
    State(state): State<crate::State>,
    headers: HeaderMap,
    Path((store_slug, entity_type_slug, entity_id)): Path<(String, String, String)>,
) -> Result<Json<EntitySeoOutput>, ApiError> {
    let ctx = context(&state, &headers, &store_slug).await?;

    guard(&ctx, "seo:write")?;

    let entity_type = entity_type(&entity_type_slug)?;
    let store_name = store_name(&state, &ctx.tenant).await?;
    let entity_name = entity_name(&state, &ctx, entity_type, &entity_id, &store_name).await?;

    seo_meta_delete(&state.pool, &ctx.tenant, entity_type, &entity_id)
        .await
        .map_err(db_error)?;

    Ok(Json(
        resolve_entity(
            &state,
            &ctx,
            &store_name,
            entity_type,
            &entity_id,
            &entity_name,
        )
        .await?,
    ))
}

/// Reads the entity row, the store row and the settings templates, then
/// resolves field by field.
async fn resolve_entity(
    state: &crate::State,
    ctx: &PanelContext,
    store_name: &str,
    entity_type: SeoEntityType,
    entity_id: &str,
    entity_name: &str,
) -> Result<EntitySeoOutput, ApiError> {
    let settings = store_seo_defaults(&state.pool, &ctx.tenant)
        .await
        .map_err(db_error)?;

    resolve_with(
        state,
        ctx,
        store_name,
        entity_type,
        entity_id,
        entity_name,
        settings,
    )
    .await
}

async fn resolve_with(
    state: &crate::State,
    ctx: &PanelContext,
    store_name: &str,
    entity_type: SeoEntityType,
    entity_id: &str,
    entity_name: &str,
    settings: Option<StoreSeoDefaults>,
) -> Result<EntitySeoOutput, ApiError> {
    let entity = seo_meta_find(&state.pool, &ctx.tenant, entity_type, entity_id)
        .await
        .map_err(db_error)?;

    // The store is its own tenant; reading its row twice would resolve a store
    // page against itself.
    let store_row = if entity_type == SeoEntityType::Store {
        None
    } else {
        seo_meta_find(
            &state.pool,
            &ctx.tenant,
            SeoEntityType::Store,
            ctx.tenant.as_str(),
        )
        .await
        .map_err(db_error)?
    };

    let resolved = resolve_seo(&SeoInput {
        entity: entity.clone(),
        store_row,
        settings,
        context: SeoContext {
            store_name: store_name.to_owned(),
            entity_name: entity_name.to_owned(),
            city: None,
        },
        fallback_title: entity_name.to_owned(),
        fallback_description: None,
    });

    Ok(EntitySeoOutput {
        saved: saved_fields(entity.as_ref()),
        resolved: resolved_dto(resolved),
    })
}

/// The entity's own name (the coupon's code), or `NOT_FOUND`. The store is its
/// own tenant, so its entity id is the tenant id.
async fn entity_name(
    state: &crate::State,
    ctx: &PanelContext,
    entity_type: SeoEntityType,
    entity_id: &str,
    store_name: &str,
) -> Result<String, ApiError> {
    if entity_type == SeoEntityType::Store {
        if entity_id != ctx.tenant.as_str() {
            return Err(ApiError::not_found());
        }

        return Ok(store_name.to_owned());
    }

    seo_entity_name(&state.pool, &ctx.tenant, entity_type, entity_id)
        .await
        .map_err(db_error)?
        .ok_or_else(ApiError::not_found)
}

async fn store_name(state: &crate::State, tenant: &TenantId) -> Result<String, ApiError> {
    store_read(&state.pool, tenant)
        .await
        .map_err(db_error)?
        .map(|store| store.display_name)
        .ok_or_else(ApiError::not_found)
}

/// The path slug narrowed to the closed set; anything else is a validation
/// failure, as the oRPC enum was.
fn entity_type(raw: &str) -> Result<SeoEntityType, ApiError> {
    SeoEntityType::parse(raw).ok_or(ApiError(ErrorCode::ValidationFailed))
}

/// `null` and a blank string both mean "not set here" — revert is per field.
fn seo_text(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_owned())
        .filter(|text| !text.is_empty())
}

/// `None` keeps the stored value; `Some(field)` writes it, `null` clearing it.
fn merge(field: Option<Option<String>>, stored: Option<String>) -> Option<String> {
    match field {
        None => stored,
        Some(value) => seo_text(value),
    }
}

fn settings_dto(settings: Option<StoreSeoDefaults>) -> StoreSeoSettings {
    match settings {
        Some(settings) => StoreSeoSettings {
            seo_title_template: settings.seo_title_template,
            seo_description_template: settings.seo_description_template,
            seo_social_image_url: settings.seo_social_image_url,
        },
        None => StoreSeoSettings::empty(),
    }
}

fn saved_fields(row: Option<&SeoMetaRow>) -> SeoFields {
    match row {
        Some(row) => SeoFields {
            title: row.title.clone(),
            description: row.description.clone(),
            canonical_url: row.canonical_url.clone(),
            social_image_url: row.social_image_url.clone(),
            json_ld: row.json_ld.clone(),
        },
        None => SeoFields::default(),
    }
}

fn resolved_dto(resolved: ResolvedSeo) -> PanelResolvedSeo {
    PanelResolvedSeo {
        title: resolved.title,
        description: resolved.description,
        canonical_url: resolved.canonical_url,
        social_image_url: resolved.social_image_url,
        json_ld: resolved.json_ld,
        source: PanelSeoSource {
            title: source_level(resolved.source.title),
            description: source_level(resolved.source.description),
            social_image_url: source_level(resolved.source.social_image_url),
        },
    }
}

fn source_level(source: SeoSource) -> SeoSourceLevel {
    match source {
        SeoSource::Entity => SeoSourceLevel::Entity,
        SeoSource::Store => SeoSourceLevel::Store,
        SeoSource::Default => SeoSourceLevel::Default,
    }
}
