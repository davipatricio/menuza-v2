//! Session tokens, cookie serialization and origin checks, mirroring
//! `apps/orpc-server/src/auth/session.ts`.

use std::collections::HashMap;
use std::fmt::Write as _;

use sha2::{Digest, Sha256};

/// Tenant dashboard session cookie.
pub const TENANT_COOKIE: &str = "menuza_tenant_sid";
/// Commerce (buyer) session cookie.
pub const COMMERCE_COOKIE: &str = "menuza_commerce_sid";
/// Absolute session lifetime: 7 days.
pub const SESSION_TTL_SECONDS: i64 = 7 * 24 * 60 * 60;
/// A session also dies after 24 hours without use.
pub const SESSION_IDLE_SECONDS: i64 = 24 * 60 * 60;
/// Sliding the idle window writes the session row; do it at most this often.
pub const SESSION_TOUCH_SECONDS: i64 = 300;

/// Raw bearer token handed to the client. The TypeScript backend used
/// `crypto.randomUUID()`, so this stays a v4 UUID string.
pub fn new_session_token() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// sha256, lowercase hex. The session row id is this digest, so never hash a
/// digest twice: a presented token is hashed once, at the lookup.
pub fn hash_session_token(token: &str) -> String {
    let digest = Sha256::digest(token.as_bytes());
    let mut hex = String::with_capacity(digest.len() * 2);

    for byte in digest.iter() {
        write!(hex, "{byte:02x}").expect("writing to a String cannot fail");
    }

    hex
}

/// Parses a `Cookie` header. Parts without `=` are skipped and a broken
/// percent-escape falls back to the raw text instead of dropping the cookie.
pub fn parse_cookies(header: Option<&str>) -> HashMap<String, String> {
    let mut cookies = HashMap::new();

    let Some(header) = header else {
        return cookies;
    };

    for part in header.split(';') {
        let Some((name, raw_value)) = part.trim().split_once('=') else {
            continue;
        };

        if name.is_empty() {
            continue;
        }

        let value = percent_decode(raw_value).unwrap_or_else(|| raw_value.to_string());

        cookies.insert(name.to_string(), value);
    }

    cookies
}

/// Looks a parsed cookie up by name.
pub fn cookie_value<'a>(cookies: &'a HashMap<String, String>, name: &str) -> Option<&'a str> {
    cookies.get(name).map(String::as_str)
}

/// `<name>=<percent-encoded token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<secs>`
///
/// An insecure cookie drops the ` Secure;` segment entirely so local HTTP
/// development works; every other attribute stays.
pub fn session_cookie(name: &str, token: &str, max_age_seconds: i64, secure: bool) -> String {
    format!(
        "{name}={}; HttpOnly;{} SameSite=Lax; Path=/; Max-Age={max_age_seconds}",
        encode_cookie_value(token),
        secure_segment(secure),
    )
}

/// `<name>=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
pub fn clear_cookie(name: &str, secure: bool) -> String {
    format!(
        "{name}=; HttpOnly;{} SameSite=Lax; Path=/; Max-Age=0",
        secure_segment(secure),
    )
}

/// The public host of the request: `x-forwarded-host` wins over `host`, and
/// only the first comma-separated value is used.
pub fn public_host<'a>(
    x_forwarded_host: Option<&'a str>,
    host: Option<&'a str>,
) -> Option<&'a str> {
    x_forwarded_host
        .and_then(first_value)
        .or_else(|| host.and_then(first_value))
}

/// Absent `Origin` and `Referer` is accepted: a non-browser client never rode
/// along on the victim's cookies. Either one present must name the public host,
/// case-insensitively, port included. An unparsable header or a missing host
/// fails closed.
pub fn is_same_origin(origin: Option<&str>, referer: Option<&str>, host: Option<&str>) -> bool {
    let origin = origin.and_then(non_empty);
    let referer = referer.and_then(non_empty);

    let Some(source) = origin.or(referer) else {
        return true;
    };

    let Some(host) = host.and_then(non_empty) else {
        return false;
    };

    scheme_and_authority(source).is_some_and(|(scheme, authority)| {
        without_default_port(scheme, authority).eq_ignore_ascii_case(host)
    })
}

fn secure_segment(secure: bool) -> &'static str {
    if secure { " Secure;" } else { "" }
}

fn non_empty(value: &str) -> Option<&str> {
    let value = value.trim();

    if value.is_empty() { None } else { Some(value) }
}

fn first_value(value: &str) -> Option<&str> {
    non_empty(value.split(',').next().unwrap_or(value))
}

/// Scheme and authority of an absolute URL: everything after `://` up to `/`,
/// `?` or `#`, with any `user@` prefix removed.
fn scheme_and_authority(url: &str) -> Option<(&str, &str)> {
    let (scheme, rest) = url.split_once("://")?;
    let end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    let authority = &rest[..end];
    let authority = authority
        .rsplit_once('@')
        .map_or(authority, |(_, host)| host);

    Some((scheme, non_empty(authority)?))
}

/// Drops the scheme's default port from an origin authority the way
/// `new URL(origin).host` does: `https` implies 443, `http` implies 80.
fn without_default_port<'a>(scheme: &str, authority: &'a str) -> &'a str {
    let default_port = if scheme.eq_ignore_ascii_case("https") {
        "443"
    } else if scheme.eq_ignore_ascii_case("http") {
        "80"
    } else {
        return authority;
    };

    match authority.rsplit_once(':') {
        Some((host, port)) if port == default_port => host,
        _ => authority,
    }
}

/// URI-component encoding, the same set `encodeURIComponent` leaves alone. A
/// UUID token is unaffected; a hand-made test token is not.
fn encode_cookie_value(value: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";

    let mut encoded = String::with_capacity(value.len());

    for &byte in value.as_bytes() {
        let unreserved = byte.is_ascii_alphanumeric()
            || matches!(
                byte,
                b'-' | b'_' | b'.' | b'!' | b'~' | b'*' | b'\'' | b'(' | b')'
            );

        if unreserved {
            encoded.push(char::from(byte));
        } else {
            encoded.push('%');
            encoded.push(char::from(HEX[usize::from(byte >> 4)]));
            encoded.push(char::from(HEX[usize::from(byte & 0x0f)]));
        }
    }

    encoded
}

/// Decodes `%XX` escapes into UTF-8. A truncated or non-hex escape, or bytes
/// that are not valid UTF-8, return `None` so the caller keeps the raw text.
fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut decoded = Vec::with_capacity(bytes.len());
    let mut index = 0;

    while index < bytes.len() {
        if bytes[index] == b'%' {
            let high = hex_digit(*bytes.get(index + 1)?)?;
            let low = hex_digit(*bytes.get(index + 2)?)?;

            decoded.push(high * 16 + low);
            index += 3;
        } else {
            decoded.push(bytes[index]);
            index += 1;
        }
    }

    String::from_utf8(decoded).ok()
}

fn hex_digit(byte: u8) -> Option<u8> {
    char::from(byte).to_digit(16).map(|digit| digit as u8)
}
