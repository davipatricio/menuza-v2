//! Store appearance: the default palette and the two rules every consumer needs.
//!
//! A store either saved its own palette or inherits the platform one. Both are
//! plain `#rrggbb` strings, so the web storefront can hand them to CSS and the
//! native app can hand them to React Native without a parser of its own. The
//! foreground is derived here, not in a client: contrast is a rule, not a
//! preference.
//!
//! The defaults mirror `apps/web/src/styles/globals.css`: a warm off-white
//! canvas, near-black ink and a soft sand accent, with the 2px storefront radius.

/// Page floor: `hsl(40 30% 97%)`.
pub const DEFAULT_BACKGROUND: &str = "#faf8f5";

/// Primary action and body ink: `hsl(30 9% 9%)`.
pub const DEFAULT_PRIMARY: &str = "#191614";

/// Soft band and hover wash: `hsl(38 20% 92%)`.
pub const DEFAULT_ACCENT: &str = "#eeeae4";

/// Base corner radius in pixels.
pub const DEFAULT_RADIUS: i32 = 2;

/// A palette with every value present: saved or default, plus the derived ink.
#[derive(Debug, Clone)]
pub struct ResolvedTheme {
    pub primary_color: String,
    pub primary_foreground: String,
    pub accent_color: String,
    pub background_color: String,
    pub foreground_color: String,
    pub radius: i32,
}

/// Fills the gaps in a saved palette with the platform defaults.
pub fn resolve(
    primary: Option<&str>,
    accent: Option<&str>,
    background: Option<&str>,
    radius: Option<i32>,
) -> ResolvedTheme {
    let primary = primary.unwrap_or(DEFAULT_PRIMARY);
    let accent = accent.unwrap_or(DEFAULT_ACCENT);
    let background = background.unwrap_or(DEFAULT_BACKGROUND);

    ResolvedTheme {
        primary_color: primary.to_owned(),
        primary_foreground: foreground_for(primary).to_owned(),
        accent_color: accent.to_owned(),
        background_color: background.to_owned(),
        foreground_color: foreground_for(background).to_owned(),
        radius: radius.unwrap_or(DEFAULT_RADIUS),
    }
}

/// `#rrggbb`, lowercase or uppercase, and nothing else.
pub fn is_hex_color(value: &str) -> bool {
    let bytes = value.as_bytes();

    bytes.len() == 7 && bytes[0] == b'#' && bytes[1..].iter().all(u8::is_ascii_hexdigit)
}

/// The ink that stays readable on `background`, using WCAG relative luminance.
///
/// Returns one of two fixed values rather than a per-channel inversion: a
/// computed mid-gray would pass on no surface.
fn foreground_for(background: &str) -> &'static str {
    let luminance = relative_luminance(background);
    let white = 1.0;
    let black = 0.0;
    let with_white = (white + 0.05) / (luminance + 0.05);
    let with_black = (luminance + 0.05) / (black + 0.05);

    if with_white >= with_black {
        "#faf8f5"
    } else {
        "#191614"
    }
}

/// WCAG 2.x relative luminance of an `#rrggbb` color.
/// An unparsable value reads as black; callers validate before storing.
fn relative_luminance(color: &str) -> f64 {
    if !is_hex_color(color) {
        return 0.0;
    }

    let channel = |range: std::ops::Range<usize>| {
        let raw = u8::from_str_radix(&color[range], 16).unwrap_or(0) as f64 / 255.0;

        if raw <= 0.040_45 {
            raw / 12.92
        } else {
            ((raw + 0.055) / 1.055).powf(2.4)
        }
    };

    0.2126 * channel(1..3) + 0.7152 * channel(3..5) + 0.0722 * channel(5..7)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_color_shape() {
        assert!(is_hex_color("#1c1917"));
        assert!(is_hex_color("#ABCDEF"));
        assert!(!is_hex_color("1c1917"));
        assert!(!is_hex_color("#1c191"));
        assert!(!is_hex_color("#1c1917ff"));
        assert!(!is_hex_color("hsl(30 9% 9%)"));
    }

    #[test]
    fn resolve_fills_missing_values() {
        let theme = resolve(Some("#000000"), None, None, Some(8));

        assert_eq!(theme.primary_foreground, "#faf8f5");
        assert_eq!(theme.accent_color, DEFAULT_ACCENT);
        assert_eq!(theme.background_color, DEFAULT_BACKGROUND);
        assert_eq!(theme.foreground_color, "#191614");
        assert_eq!(theme.radius, 8);
    }

    #[test]
    fn dark_surface_gets_light_ink() {
        assert_eq!(foreground_for(DEFAULT_PRIMARY), "#faf8f5");
        assert_eq!(foreground_for("#000000"), "#faf8f5");
    }

    #[test]
    fn light_surface_gets_dark_ink() {
        assert_eq!(foreground_for(DEFAULT_BACKGROUND), "#191614");
        assert_eq!(foreground_for("#ffffff"), "#191614");
    }
}
