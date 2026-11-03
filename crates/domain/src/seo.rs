//! SEO token substitution and per-field resolution, mirroring
//! `packages/shared/src/seo/{tokens,resolve,types}.ts`.
//!
//! Pure: no I/O, no clock, no env.

/// Mirrors the contract's `seo_entity_type` enum slugs.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SeoEntityType {
    Store,
    Department,
    Category,
    Tag,
    Product,
    Kit,
    Coupon,
}

/// One `SeoMeta` row: the five editable columns plus its entity identity.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeoMetaRow {
    pub entity_type: SeoEntityType,
    pub entity_id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub canonical_url: Option<String>,
    pub social_image_url: Option<String>,
    pub json_ld: Option<String>,
}

/// The store-level defaults (`StoreSettings`), one row per tenant.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoreSeoDefaults {
    pub seo_title_template: Option<String>,
    pub seo_description_template: Option<String>,
    pub seo_social_image_url: Option<String>,
}

/// Values the `%store%` / `%entity%` / `%city%` tokens read.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeoContext {
    pub store_name: String,
    pub entity_name: String,
    pub city: Option<String>,
}

/// Which inheritance level won the field. `Store` covers the settings template
/// too: it is store-level configuration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SeoSource {
    Entity,
    Store,
    Default,
}

/// Which level won each inheritable field.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ResolvedSeoSource {
    pub title: SeoSource,
    pub description: SeoSource,
    pub social_image_url: SeoSource,
}

/// The SEO fields a page renders.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedSeo {
    pub title: String,
    pub description: Option<String>,
    pub canonical_url: Option<String>,
    pub social_image_url: Option<String>,
    pub json_ld: Option<String>,
    pub source: ResolvedSeoSource,
}

/// Inputs to [`resolve_seo`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SeoInput {
    pub entity: Option<SeoMetaRow>,
    pub store_row: Option<SeoMetaRow>,
    pub settings: Option<StoreSeoDefaults>,
    pub context: SeoContext,
    pub fallback_title: String,
    pub fallback_description: Option<String>,
}

/// Substitutes `%store%`, `%entity%` and `%city%` (case-sensitive, literal) in a
/// store-level template. Unknown `%...%` sequences and templates without a known
/// token come back untouched; `%city%` without a city resolves to nothing rather
/// than the raw token or `"undefined"`.
///
/// Whitespace is collapsed everywhere once a token is present, so a template's
/// own double spaces go too. Narrow it to the substitution seams when templates
/// start carrying meaningful interior spacing.
pub fn apply_tokens(template: &str, context: &SeoContext) -> String {
    if !has_known_token(template) {
        return template.to_string();
    }

    let city = context.city.as_deref().unwrap_or_default();
    let substituted = template
        .replace("%store%", &context.store_name)
        .replace("%entity%", &context.entity_name)
        .replace("%city%", city);

    collapse_whitespace(&substituted)
}

/// Resolves the SEO fields a page renders, per field, entity → store row →
/// settings template → static fallback. `canonical_url` and `json_ld` are
/// entity-only: a canonical URL or structured-data block inherited from the
/// store would describe a different page.
///
/// `source` collapses the settings template into [`SeoSource::Store`]. A
/// template that resolves to an empty string (eg. only `%city%` with no city)
/// falls through to the fallback.
pub fn resolve_seo(input: &SeoInput) -> ResolvedSeo {
    let settings_title = input
        .settings
        .as_ref()
        .and_then(|settings| settings.seo_title_template.as_deref())
        .map(|template| apply_tokens(template, &input.context))
        .and_then(|title| text_or_null(Some(title.as_str())));

    let settings_description = input
        .settings
        .as_ref()
        .and_then(|settings| settings.seo_description_template.as_deref())
        .map(|template| apply_tokens(template, &input.context))
        .and_then(|description| text_or_null(Some(description.as_str())));

    let title_level = first_set(
        [
            (
                text_or_null(input.entity.as_ref().and_then(|row| row.title.as_deref())),
                SeoSource::Entity,
            ),
            (
                text_or_null(
                    input
                        .store_row
                        .as_ref()
                        .and_then(|row| row.title.as_deref()),
                ),
                SeoSource::Store,
            ),
            (settings_title, SeoSource::Store),
        ],
        (Some(input.fallback_title.clone()), SeoSource::Default),
    );

    let description_level = first_set(
        [
            (
                text_or_null(
                    input
                        .entity
                        .as_ref()
                        .and_then(|row| row.description.as_deref()),
                ),
                SeoSource::Entity,
            ),
            (
                text_or_null(
                    input
                        .store_row
                        .as_ref()
                        .and_then(|row| row.description.as_deref()),
                ),
                SeoSource::Store,
            ),
            (settings_description, SeoSource::Store),
        ],
        (
            text_or_null(input.fallback_description.as_deref()),
            SeoSource::Default,
        ),
    );

    let social_image_level = first_set(
        [
            (
                text_or_null(
                    input
                        .entity
                        .as_ref()
                        .and_then(|row| row.social_image_url.as_deref()),
                ),
                SeoSource::Entity,
            ),
            (
                text_or_null(
                    input
                        .store_row
                        .as_ref()
                        .and_then(|row| row.social_image_url.as_deref()),
                ),
                SeoSource::Store,
            ),
            (
                text_or_null(
                    input
                        .settings
                        .as_ref()
                        .and_then(|s| s.seo_social_image_url.as_deref()),
                ),
                SeoSource::Store,
            ),
        ],
        (None, SeoSource::Default),
    );

    ResolvedSeo {
        title: title_level
            .0
            .unwrap_or_else(|| input.fallback_title.clone()),
        description: description_level.0,
        canonical_url: text_or_null(
            input
                .entity
                .as_ref()
                .and_then(|row| row.canonical_url.as_deref()),
        ),
        social_image_url: social_image_level.0,
        json_ld: text_or_null(input.entity.as_ref().and_then(|row| row.json_ld.as_deref())),
        source: ResolvedSeoSource {
            title: title_level.1,
            description: description_level.1,
            social_image_url: social_image_level.1,
        },
    }
}

/// A blank string is "not set" at every level — a token-only template can
/// resolve empty.
fn text_or_null(value: Option<&str>) -> Option<String> {
    match value {
        Some(value) if !value.is_empty() => Some(value.to_string()),
        _ => None,
    }
}

fn first_set(
    levels: [(Option<String>, SeoSource); 3],
    fallback: (Option<String>, SeoSource),
) -> (Option<String>, SeoSource) {
    levels
        .into_iter()
        .find(|(value, _)| value.is_some())
        .unwrap_or(fallback)
}

fn has_known_token(template: &str) -> bool {
    template.contains("%store%") || template.contains("%entity%") || template.contains("%city%")
}

/// `/\s+/g` → `" "`, then trim.
fn collapse_whitespace(text: &str) -> String {
    let mut collapsed = String::with_capacity(text.len());
    let mut pending_space = false;

    for character in text.chars() {
        if character.is_whitespace() {
            pending_space = !collapsed.is_empty();
        } else {
            if pending_space {
                collapsed.push(' ');
                pending_space = false;
            }

            collapsed.push(character);
        }
    }

    collapsed
}

#[cfg(test)]
mod tests {
    use super::*;

    fn context() -> SeoContext {
        SeoContext {
            store_name: "Pão da Vila".to_string(),
            entity_name: "Pão de queijo".to_string(),
            city: None,
        }
    }

    fn row(entity_type: SeoEntityType) -> SeoMetaRow {
        SeoMetaRow {
            entity_type,
            entity_id: "id".to_string(),
            title: None,
            description: None,
            canonical_url: None,
            social_image_url: None,
            json_ld: None,
        }
    }

    fn settings() -> StoreSeoDefaults {
        StoreSeoDefaults {
            seo_title_template: None,
            seo_description_template: None,
            seo_social_image_url: None,
        }
    }

    #[test]
    fn replaces_all_three_tokens() {
        let with_city = SeoContext {
            city: Some("Recife".to_string()),
            ..context()
        };

        assert_eq!(
            apply_tokens("%entity% — %store% em %city%", &with_city),
            "Pão de queijo — Pão da Vila em Recife",
        );
    }

    #[test]
    fn leaves_unknown_tokens_untouched() {
        assert_eq!(
            apply_tokens("%foo% %entity% %BAR%", &context()),
            "%foo% Pão de queijo %BAR%",
        );
    }

    #[test]
    fn resolves_city_to_nothing_without_a_city() {
        assert_eq!(
            apply_tokens("%entity% · %city%", &context()),
            "Pão de queijo ·",
        );
    }

    #[test]
    fn collapses_the_whitespace_a_substitution_introduces() {
        assert_eq!(
            apply_tokens("%entity%   em    %store%", &context()),
            "Pão de queijo em Pão da Vila",
        );
        assert_eq!(
            apply_tokens("  %city% %entity%  ", &context()),
            "Pão de queijo",
        );
    }

    #[test]
    fn returns_a_token_free_template_byte_for_byte() {
        assert_eq!(
            apply_tokens("  Menuza   storefront  ", &context()),
            "  Menuza   storefront  ",
        );
        assert_eq!(apply_tokens("", &context()), "");
    }

    #[test]
    fn a_set_entity_field_wins_and_reports_source_entity() {
        let resolved = resolve_seo(&SeoInput {
            entity: Some(SeoMetaRow {
                title: Some("Pão de queijo Mineiro".to_string()),
                description: Some("Receita da casa.".to_string()),
                canonical_url: Some(
                    "https://menuza.app/store/pao-da-vila/product/pao-de-queijo".to_string(),
                ),
                social_image_url: Some("https://cdn.menuza.app/pao.jpg".to_string()),
                json_ld: Some(r#"{"@type":"Product"}"#.to_string()),
                ..row(SeoEntityType::Product)
            }),
            store_row: Some(SeoMetaRow {
                title: Some("Loja".to_string()),
                description: Some("Loja.".to_string()),
                social_image_url: Some("s.jpg".to_string()),
                ..row(SeoEntityType::Store)
            }),
            settings: Some(StoreSeoDefaults {
                seo_title_template: Some("%entity% — %store%".to_string()),
                seo_description_template: Some("%store%".to_string()),
                seo_social_image_url: Some("settings.jpg".to_string()),
            }),
            context: context(),
            fallback_title: "Menuza".to_string(),
            fallback_description: Some("Delivery.".to_string()),
        });

        assert_eq!(resolved.title, "Pão de queijo Mineiro");
        assert_eq!(resolved.description.as_deref(), Some("Receita da casa."));
        assert_eq!(
            resolved.canonical_url.as_deref(),
            Some("https://menuza.app/store/pao-da-vila/product/pao-de-queijo"),
        );
        assert_eq!(
            resolved.social_image_url.as_deref(),
            Some("https://cdn.menuza.app/pao.jpg"),
        );
        assert_eq!(resolved.json_ld.as_deref(), Some(r#"{"@type":"Product"}"#));
        assert_eq!(
            resolved.source,
            ResolvedSeoSource {
                title: SeoSource::Entity,
                description: SeoSource::Entity,
                social_image_url: SeoSource::Entity,
            },
        );
    }

    #[test]
    fn falls_back_to_the_store_row_when_the_entity_has_nothing() {
        let resolved = resolve_seo(&SeoInput {
            entity: Some(row(SeoEntityType::Category)),
            store_row: Some(SeoMetaRow {
                title: Some("Pão da Vila".to_string()),
                description: Some("Pães artesanais.".to_string()),
                social_image_url: Some("store.jpg".to_string()),
                ..row(SeoEntityType::Store)
            }),
            settings: Some(StoreSeoDefaults {
                seo_title_template: Some("%entity% — %store%".to_string()),
                seo_social_image_url: Some("settings.jpg".to_string()),
                ..settings()
            }),
            context: context(),
            fallback_title: "Menuza".to_string(),
            fallback_description: None,
        });

        assert_eq!(resolved.title, "Pão da Vila");
        assert_eq!(resolved.description.as_deref(), Some("Pães artesanais."));
        assert_eq!(resolved.social_image_url.as_deref(), Some("store.jpg"));
        assert_eq!(
            resolved.source,
            ResolvedSeoSource {
                title: SeoSource::Store,
                description: SeoSource::Store,
                social_image_url: SeoSource::Store,
            },
        );
    }

    #[test]
    fn the_settings_template_reports_source_store() {
        let resolved = resolve_seo(&SeoInput {
            entity: None,
            store_row: None,
            settings: Some(StoreSeoDefaults {
                seo_title_template: Some("%entity% — %store%".to_string()),
                seo_description_template: Some("%entity% em %store%".to_string()),
                seo_social_image_url: Some("settings.jpg".to_string()),
            }),
            context: context(),
            fallback_title: "Menuza".to_string(),
            fallback_description: None,
        });

        assert_eq!(resolved.title, "Pão de queijo — Pão da Vila");
        assert_eq!(
            resolved.description.as_deref(),
            Some("Pão de queijo em Pão da Vila"),
        );
        assert_eq!(resolved.social_image_url.as_deref(), Some("settings.jpg"));
        assert_eq!(
            resolved.source,
            ResolvedSeoSource {
                title: SeoSource::Store,
                description: SeoSource::Store,
                social_image_url: SeoSource::Store,
            },
        );
    }

    #[test]
    fn nothing_set_anywhere_yields_the_fallbacks_and_source_default() {
        let resolved = resolve_seo(&SeoInput {
            entity: None,
            store_row: None,
            settings: None,
            context: context(),
            fallback_title: "Menuza".to_string(),
            fallback_description: Some("Delivery em Recife.".to_string()),
        });

        assert_eq!(resolved.title, "Menuza");
        assert_eq!(resolved.description.as_deref(), Some("Delivery em Recife."),);
        assert_eq!(resolved.social_image_url, None);
        assert_eq!(resolved.canonical_url, None);
        assert_eq!(resolved.json_ld, None);
        assert_eq!(
            resolved.source,
            ResolvedSeoSource {
                title: SeoSource::Default,
                description: SeoSource::Default,
                social_image_url: SeoSource::Default,
            },
        );
    }

    #[test]
    fn a_city_only_template_with_no_city_falls_through_to_the_default() {
        let resolved = resolve_seo(&SeoInput {
            entity: None,
            store_row: None,
            settings: Some(StoreSeoDefaults {
                seo_title_template: Some("%city%".to_string()),
                seo_description_template: Some(" %city% ".to_string()),
                ..settings()
            }),
            context: context(),
            fallback_title: "Menuza".to_string(),
            fallback_description: Some("Delivery.".to_string()),
        });

        assert_eq!(resolved.title, "Menuza");
        assert_eq!(resolved.description.as_deref(), Some("Delivery."));
        assert_eq!(resolved.source.title, SeoSource::Default);
        assert_eq!(resolved.source.description, SeoSource::Default);
    }

    #[test]
    fn canonical_url_and_json_ld_never_inherit() {
        let resolved = resolve_seo(&SeoInput {
            entity: None,
            store_row: Some(SeoMetaRow {
                title: Some("Pão da Vila".to_string()),
                canonical_url: Some("https://menuza.app/store/pao-da-vila".to_string()),
                json_ld: Some(r#"{"@type":"Store"}"#.to_string()),
                ..row(SeoEntityType::Store)
            }),
            settings: None,
            context: context(),
            fallback_title: "Menuza".to_string(),
            fallback_description: None,
        });

        assert_eq!(resolved.canonical_url, None);
        assert_eq!(resolved.json_ld, None);
    }

    #[test]
    fn social_image_url_chains_independently_of_the_title() {
        let resolved = resolve_seo(&SeoInput {
            entity: Some(SeoMetaRow {
                title: Some("Pão de queijo".to_string()),
                ..row(SeoEntityType::Product)
            }),
            store_row: Some(SeoMetaRow {
                social_image_url: Some("store.jpg".to_string()),
                ..row(SeoEntityType::Store)
            }),
            settings: Some(StoreSeoDefaults {
                seo_social_image_url: Some("settings.jpg".to_string()),
                seo_title_template: Some("%entity%".to_string()),
                ..settings()
            }),
            context: context(),
            fallback_title: "Menuza".to_string(),
            fallback_description: None,
        });

        assert_eq!(resolved.title, "Pão de queijo");
        assert_eq!(resolved.social_image_url.as_deref(), Some("store.jpg"));
        assert_eq!(resolved.source.title, SeoSource::Entity);
        assert_eq!(resolved.source.social_image_url, SeoSource::Store);
    }
}
