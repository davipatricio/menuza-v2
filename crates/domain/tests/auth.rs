//! Pure auth tests: password hashing, session tokens, cookies and origin
//! checks. No database, no network, no async.

use domain::password::{hash_password, verify_password};
use domain::session::{
    clear_cookie, cookie_value, hash_session_token, is_same_origin, new_session_token,
    parse_cookies, public_host, session_cookie,
};

#[test]
fn verify_accepts_the_right_password_only() {
    let hash = hash_password("correct horse").expect("hashing works");

    assert!(verify_password("correct horse", Some(&hash)));
    assert!(!verify_password("wrong horse", Some(&hash)));
    assert!(!verify_password("x", None));
    assert!(!verify_password("x", Some("$argon2id$garbage")));
}

#[test]
fn hashes_are_argon2id() {
    let hash = hash_password("secret").expect("hashing works");

    assert!(hash.starts_with("$argon2id$"), "{hash}");
}

#[test]
fn a_fresh_salt_makes_every_hash_unique() {
    let first = hash_password("secret").expect("hashing works");
    let second = hash_password("secret").expect("hashing works");

    assert_ne!(first, second);
}

#[test]
fn session_token_digest_is_sha256_hex() {
    assert_eq!(
        hash_session_token("abc"),
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
}

#[test]
fn session_tokens_are_v4_uuids() {
    let token = new_session_token();
    let parsed = uuid::Uuid::parse_str(&token).expect("a session token is a UUID");

    assert_eq!(parsed.get_version_num(), 4);
}

#[test]
fn cookies_match_the_typescript_serialization() {
    assert_eq!(
        session_cookie("menuza_tenant_sid", "a b", 60, true),
        "menuza_tenant_sid=a%20b; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=60"
    );
    assert_eq!(
        session_cookie("menuza_tenant_sid", "a b", 60, false),
        "menuza_tenant_sid=a%20b; HttpOnly; SameSite=Lax; Path=/; Max-Age=60"
    );
    assert_eq!(
        clear_cookie("menuza_tenant_sid", true),
        "menuza_tenant_sid=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0"
    );
}

#[test]
fn parse_cookies_decodes_values_and_skips_junk() {
    let cookies = parse_cookies(Some("a=1; b=hello%20world; broken"));

    assert_eq!(cookie_value(&cookies, "a"), Some("1"));
    assert_eq!(cookie_value(&cookies, "b"), Some("hello world"));
    assert!(!cookies.contains_key("broken"));
}

#[test]
fn origin_check_fails_closed() {
    assert!(is_same_origin(None, None, Some("x.test")));
    assert!(is_same_origin(
        Some("https://x.test/login"),
        None,
        Some("x.test")
    ));
    assert!(!is_same_origin(
        Some("https://evil.test"),
        None,
        Some("x.test")
    ));
    assert!(is_same_origin(
        None,
        Some("https://X.TEST/a"),
        Some("x.test")
    ));
    assert!(!is_same_origin(Some("https://x.test"), None, None));
    assert!(!is_same_origin(Some("not a url"), None, Some("x.test")));
}

#[test]
fn origin_check_compares_ports() {
    assert!(!is_same_origin(
        Some("https://app.test:9999"),
        None,
        Some("app.test:3000")
    ));
}

#[test]
fn https_origin_drops_the_default_port() {
    assert!(is_same_origin(
        Some("https://app.test:443"),
        None,
        Some("app.test")
    ));
}

#[test]
fn http_origin_drops_the_default_port() {
    assert!(is_same_origin(
        Some("http://app.test:80"),
        None,
        Some("app.test")
    ));
}

#[test]
fn forwarded_host_wins_over_host() {
    assert_eq!(
        public_host(Some("a.test, b.test"), Some("c.test")),
        Some("a.test")
    );
    assert_eq!(public_host(None, Some("c.test")), Some("c.test"));
}
