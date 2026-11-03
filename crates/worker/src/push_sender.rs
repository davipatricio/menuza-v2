//! The Web Push sender: an ES256 VAPID JWT and an aes128gcm body.
//!
//! The Bun worker used `web-push`; that crate is tokio 0.1 + hyper 0.12 +
//! rust-crypto at 0.4.2 and hyper 0.14 at 0.11, so nothing of it survives here.
//! The two protocol pieces are done directly instead: `p256` signs the VAPID
//! token and does the payload ECDH, `hkdf` derives the content key and nonce,
//! `aes-gcm` seals the record, and `reqwest` posts it (RFC 8291, RFC 8292,
//! RFC 8188). No OpenSSL: `ece` only ships an OpenSSL backend.
//!
//! Configuration is three environment variables. Any missing, blank or
//! malformed key leaves the sender disabled and the job completes without
//! sending: a key is deploy configuration, so a retry cannot repair it. Nothing
//! here logs a key, an endpoint or a payload — the endpoint is the capability.

use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use aes_gcm::aead::{Aead, Key, KeyInit};
use aes_gcm::{Aes128Gcm, Nonce};
use base64::Engine as _;
use base64::engine::general_purpose::{URL_SAFE_NO_PAD, URL_SAFE_PAD_INDIFFERENT};
use hkdf::Hkdf;
use p256::ecdsa::signature::Signer as _;
use p256::ecdsa::{Signature, SigningKey};
use p256::{PublicKey, Sec1Point, SecretKey, ecdh::diffie_hellman};
use sha2::Sha256;

use contract::tenant::push::is_allowed_push_endpoint;

/// `TTL` in seconds. An order notification goes stale fast; a device that has
/// been offline for an hour does not want yesterday's `ORDER_READY` at boot.
pub const TTL_SECONDS: u32 = 3600;

/// The JWT lives long enough for one job's retries inside the attempt budget.
const JWT_LIFETIME_SECONDS: u64 = 12 * 60 * 60;

/// `{"typ":"JWT","alg":"ES256"}`, fixed so the encoded header is stable.
const JWT_HEADER: &[u8] = br#"{"typ":"JWT","alg":"ES256"}"#;

/// aes128gcm record size, header field `rs`. One record covers every payload
/// this sender produces; the value must exceed the header plus the delimiter.
const RECORD_SIZE: u32 = 4096;

/// The push service refuses a body over 4096 octets, and the record header is
/// 86 of them.
const MAX_BODY_BYTES: usize = 4096;

const SALT_BYTES: usize = 16;
const AUTH_SECRET_BYTES: usize = 16;
const KEY_BYTES: usize = 32;
const CEK_BYTES: usize = 16;
const NONCE_BYTES: usize = 12;
/// One uncompressed P-256 point: `0x04` then the 32-byte coordinates.
const POINT_BYTES: usize = 65;
/// salt(16) + rs(4) + idlen(1) + keyid(65).
const HEADER_BYTES: usize = SALT_BYTES + 4 + 1 + POINT_BYTES;

/// Why a push could not be prepared or sent. Messages never carry a key, an
/// endpoint or a payload.
#[derive(Debug, thiserror::Error)]
pub enum SenderError {
    #[error("VAPID keys are missing or malformed")]
    Keys,
    #[error("push subscription keys are malformed")]
    SubscriptionKeys,
    #[error("push endpoint is not an allowed provider host")]
    Endpoint,
    #[error("push payload could not be encrypted")]
    Encrypt,
    #[error("push payload does not fit one record")]
    TooLarge,
    #[error("the push client could not be built")]
    Client,
    #[error("the push request did not complete")]
    Transport,
}

/// The VAPID identity every request to a push service is signed with.
pub struct Vapid {
    subject: String,
    signing_key: SigningKey,
    /// The application server key, base64url, exactly as the browser saw it.
    public_key: String,
}

impl Vapid {
    /// `None` when any of the three keys is absent or blank: push is disabled.
    ///
    /// A malformed key is also `None`, logged once per job: there is no retry
    /// that fixes a deploy variable.
    pub fn from_env() -> Option<Self> {
        let subject = non_empty("VAPID_SUBJECT")?;
        let public_key = non_empty("VAPID_PUBLIC_KEY")?;
        let private_key = non_empty("VAPID_PRIVATE_KEY")?;

        match Self::from_parts(&subject, &public_key, &private_key) {
            Ok(vapid) => Some(vapid),
            Err(error) => {
                tracing::error!(%error, "VAPID keys are invalid; push is disabled");

                None
            }
        }
    }

    /// Builds the identity, refusing a public key that does not belong to the
    /// private one: that pair fails every request with an opaque 401.
    pub fn from_parts(
        subject: &str,
        public_key: &str,
        private_key: &str,
    ) -> Result<Self, SenderError> {
        if subject.trim().is_empty() {
            return Err(SenderError::Keys);
        }

        let public_bytes = URL_SAFE_PAD_INDIFFERENT
            .decode(public_key.trim())
            .map_err(|_| SenderError::Keys)?;
        let private_bytes = URL_SAFE_PAD_INDIFFERENT
            .decode(private_key.trim())
            .map_err(|_| SenderError::Keys)?;
        let secret = SecretKey::from_slice(&private_bytes).map_err(|_| SenderError::Keys)?;

        if Sec1Point::from(&secret.public_key()).as_bytes() != public_bytes.as_slice() {
            return Err(SenderError::Keys);
        }

        Ok(Self {
            subject: subject.trim().to_owned(),
            signing_key: SigningKey::from(&secret),
            public_key: URL_SAFE_NO_PAD.encode(public_bytes),
        })
    }

    /// The `Authorization` value: `vapid t=<jwt>, k=<application server key>`.
    fn authorization(&self, endpoint: &str, now: u64) -> Result<String, SenderError> {
        let audience = origin(endpoint).ok_or(SenderError::Endpoint)?;

        let claims = serde_json::json!({
            "aud": audience,
            "exp": now + JWT_LIFETIME_SECONDS,
            "sub": self.subject,
        })
        .to_string();

        let signing_input = format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(JWT_HEADER),
            URL_SAFE_NO_PAD.encode(claims)
        );

        let signature: Signature = self
            .signing_key
            .try_sign(signing_input.as_bytes())
            .map_err(|_| SenderError::Keys)?;

        Ok(format!(
            "vapid t={signing_input}.{}, k={}",
            URL_SAFE_NO_PAD.encode(signature.to_bytes()),
            self.public_key
        ))
    }
}

/// One browser subscription, as stored: the endpoint plus its two keys.
pub struct PushSubscription<'a> {
    pub endpoint: &'a str,
    pub p256dh: &'a str,
    pub auth: &'a str,
}

/// What the push service answered. The body is never read: only the status
/// separates "delivered", "this device is gone" and "try again".
pub struct PushResponse {
    pub status: u16,
}

impl PushResponse {
    /// 404 and 410 mean the subscription can never be delivered to again.
    pub fn is_gone(&self) -> bool {
        matches!(self.status, 404 | 410)
    }

    pub fn is_success(&self) -> bool {
        (200..300).contains(&self.status)
    }
}

/// Encrypts and posts one notification.
pub async fn send(
    vapid: &Vapid,
    subscription: &PushSubscription<'_>,
    payload: &[u8],
) -> Result<PushResponse, SenderError> {
    // The sender is the egress boundary: a caller that forgot to filter a
    // stored endpoint must not turn this process into an SSRF proxy.
    if !is_allowed_push_endpoint(subscription.endpoint) {
        return Err(SenderError::Endpoint);
    }

    let p256dh = URL_SAFE_PAD_INDIFFERENT
        .decode(subscription.p256dh.trim())
        .map_err(|_| SenderError::SubscriptionKeys)?;
    let auth = URL_SAFE_PAD_INDIFFERENT
        .decode(subscription.auth.trim())
        .map_err(|_| SenderError::SubscriptionKeys)?;

    if auth.len() != AUTH_SECRET_BYTES {
        return Err(SenderError::SubscriptionKeys);
    }

    let mut salt = [0u8; SALT_BYTES];
    getrandom::fill(&mut salt).map_err(|_| SenderError::Encrypt)?;

    let mut ephemeral = [0u8; KEY_BYTES];
    getrandom::fill(&mut ephemeral).map_err(|_| SenderError::Encrypt)?;

    let body = encrypt(&p256dh, &auth, payload, &salt, &ephemeral)?;
    let authorization = vapid.authorization(subscription.endpoint, unix_now())?;

    let response = client()?
        .post(subscription.endpoint)
        .header("Authorization", authorization)
        .header("Content-Encoding", "aes128gcm")
        .header("Content-Type", "application/octet-stream")
        .header("TTL", TTL_SECONDS.to_string())
        .body(body)
        .send()
        .await
        .map_err(|_| SenderError::Transport)?;

    Ok(PushResponse {
        status: response.status().as_u16(),
    })
}

/// The process-wide client: one pool of connections, no redirects (the endpoint
/// is allowlisted, and a redirect would leave it), and a bounded timeout.
fn client() -> Result<&'static reqwest::Client, SenderError> {
    static CLIENT: OnceLock<reqwest::Client> = OnceLock::new();

    if let Some(client) = CLIENT.get() {
        return Ok(client);
    }

    // `reqwest` is built with `rustls-no-provider`; ring is already linked by
    // sqlx, so installing it costs nothing and avoids aws-lc-rs's cmake build.
    let _ = rustls::crypto::ring::default_provider().install_default();

    let built = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|_| SenderError::Client)?;

    Ok(CLIENT.get_or_init(|| built))
}

/// Encrypts one record with aes128gcm.
///
/// The salt and the ephemeral secret are parameters rather than draws so the
/// test can freeze the whole body; production passes fresh random bytes.
fn encrypt(
    p256dh: &[u8],
    auth: &[u8],
    plaintext: &[u8],
    salt: &[u8; SALT_BYTES],
    ephemeral_secret: &[u8; KEY_BYTES],
) -> Result<Vec<u8>, SenderError> {
    let subscription_key =
        PublicKey::from_sec1_bytes(p256dh).map_err(|_| SenderError::SubscriptionKeys)?;
    let ephemeral = SecretKey::from_slice(ephemeral_secret).map_err(|_| SenderError::Encrypt)?;
    // P-256 points are uncompressed here (`COMPRESS_POINTS` is off), so this is
    // always the 65 bytes `idlen` and `keyid` describe.
    let ephemeral_public = Sec1Point::from(&ephemeral.public_key()).as_bytes().to_vec();

    let shared = diffie_hellman(ephemeral.to_nonzero_scalar(), subscription_key.as_affine());
    let (cek, nonce) = derive_keys(
        shared.raw_secret_bytes(),
        auth,
        p256dh,
        &ephemeral_public,
        salt,
    )?;

    // One record: the plaintext, the last-record delimiter, then the tag.
    let record_len = HEADER_BYTES + plaintext.len() + 1 + 16;

    if record_len > MAX_BODY_BYTES {
        return Err(SenderError::TooLarge);
    }

    let mut record = Vec::with_capacity(plaintext.len() + 1);
    record.extend_from_slice(plaintext);
    record.push(0x02);

    let sealed = Aes128Gcm::new(&Key::<Aes128Gcm>::from(cek))
        .encrypt(&Nonce::from(nonce), record.as_ref())
        .map_err(|_| SenderError::Encrypt)?;

    let mut body = Vec::with_capacity(record_len);
    body.extend_from_slice(salt);
    body.extend_from_slice(&RECORD_SIZE.to_be_bytes());
    body.push(POINT_BYTES as u8);
    body.extend_from_slice(&ephemeral_public);
    body.extend_from_slice(&sealed);

    Ok(body)
}

/// RFC 8291 key schedule: the auth secret seeds the ECDH secret into the input
/// keying material, then the salt splits it into the content key and nonce.
fn derive_keys(
    shared: &[u8],
    auth: &[u8],
    p256dh: &[u8],
    ephemeral_public: &[u8],
    salt: &[u8; SALT_BYTES],
) -> Result<([u8; CEK_BYTES], [u8; NONCE_BYTES]), SenderError> {
    let mut info = Vec::with_capacity("WebPush: info\0".len() + POINT_BYTES * 2);
    info.extend_from_slice(b"WebPush: info\0");
    info.extend_from_slice(p256dh);
    info.extend_from_slice(ephemeral_public);

    let mut ikm = [0u8; KEY_BYTES];

    Hkdf::<Sha256>::new(Some(auth), shared)
        .expand(&info, &mut ikm)
        .map_err(|_| SenderError::Encrypt)?;

    let hkdf = Hkdf::<Sha256>::new(Some(salt), &ikm);
    let mut cek = [0u8; CEK_BYTES];
    let mut nonce = [0u8; NONCE_BYTES];

    hkdf.expand(b"Content-Encoding: aes128gcm\0", &mut cek)
        .map_err(|_| SenderError::Encrypt)?;
    hkdf.expand(b"Content-Encoding: nonce\0", &mut nonce)
        .map_err(|_| SenderError::Encrypt)?;

    Ok((cek, nonce))
}

/// The `aud` claim: scheme and authority of the endpoint, no path.
fn origin(endpoint: &str) -> Option<&str> {
    let scheme_end = endpoint.find("://")? + 3;
    let rest = &endpoint[scheme_end..];
    let host_len = rest.find(['/', '?', '#']).unwrap_or(rest.len());

    (host_len > 0).then(|| &endpoint[..scheme_end + host_len])
}

fn unix_now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or_default()
}

/// Absent and blank are the same thing: neither is a key.
fn non_empty(key: &str) -> Option<String> {
    std::env::var(key)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use aes_gcm::aead::{Aead, Key, KeyInit};
    use aes_gcm::{Aes128Gcm, Nonce};
    use base64::Engine as _;
    use base64::engine::general_purpose::{URL_SAFE_NO_PAD, URL_SAFE_PAD_INDIFFERENT};
    use p256::ecdsa::Signature;
    use p256::ecdsa::signature::Verifier as _;
    use p256::{PublicKey, Sec1Point, SecretKey, ecdh::diffie_hellman};

    use super::{
        HEADER_BYTES, JWT_HEADER, POINT_BYTES, RECORD_SIZE, SALT_BYTES, SenderError, Vapid,
        derive_keys, encrypt, origin,
    };

    /// A fixed VAPID pair: private key `01` repeated, public key derived from it.
    const VAPID_PRIVATE: [u8; 32] = [1u8; 32];
    /// A fixed browser pair and auth secret, so the body below is stable.
    const UA_PRIVATE: [u8; 32] = [2u8; 32];
    const AUTH_SECRET: [u8; 16] = [3u8; 16];
    const EPHEMERAL_SECRET: [u8; 32] = [4u8; 32];
    const SALT: [u8; 16] = [5u8; 16];

    fn encode(bytes: &[u8]) -> String {
        URL_SAFE_NO_PAD.encode(bytes)
    }

    fn vapid() -> Vapid {
        let key = SecretKey::from_slice(&VAPID_PRIVATE).expect("the scalar is valid");
        let public = Sec1Point::from(&key.public_key());

        Vapid::from_parts(
            "mailto:ops@menuza.test",
            &encode(public.as_bytes()),
            &encode(&VAPID_PRIVATE),
        )
        .expect("the pair matches")
    }

    fn ua_public() -> Vec<u8> {
        let key = SecretKey::from_slice(&UA_PRIVATE).expect("the scalar is valid");

        Sec1Point::from(&key.public_key()).as_bytes().to_vec()
    }

    #[test]
    fn origin_is_scheme_and_authority() {
        assert_eq!(
            origin("https://fcm.googleapis.com/fcm/send/abc?x=1"),
            Some("https://fcm.googleapis.com")
        );
        assert_eq!(
            origin("https://updates.push.services.mozilla.com"),
            Some("https://updates.push.services.mozilla.com")
        );
        assert_eq!(origin("not a url"), None);
    }

    #[test]
    fn the_jwt_is_es256_over_the_endpoint_origin() {
        let vapid = vapid();
        let token = vapid
            .authorization("https://fcm.googleapis.com/fcm/send/abc", 1_700_000_000)
            .expect("the endpoint has an origin");

        let token = token
            .strip_prefix("vapid t=")
            .expect("the header names the scheme");
        let (token, key) = token
            .split_once(", k=")
            .expect("the key is the second part");

        assert_eq!(key, encode(&vapid_public(&vapid)));

        let parts: Vec<&str> = token.split('.').collect();
        assert_eq!(parts.len(), 3, "{token}");

        let header = URL_SAFE_PAD_INDIFFERENT
            .decode(parts[0])
            .expect("the header decodes");
        let claims: serde_json::Value = serde_json::from_slice(
            &URL_SAFE_PAD_INDIFFERENT
                .decode(parts[1])
                .expect("the claims decode"),
        )
        .expect("the claims are JSON");

        assert_eq!(header, JWT_HEADER);
        assert_eq!(claims["aud"], "https://fcm.googleapis.com");
        assert_eq!(claims["exp"], 1_700_000_000u64 + 43_200);
        assert_eq!(claims["sub"], "mailto:ops@menuza.test");

        let signature = URL_SAFE_PAD_INDIFFERENT
            .decode(parts[2])
            .expect("the signature decodes");

        assert_eq!(signature.len(), 64, "ES256 is r||s, not DER");

        vapid
            .signing_key
            .verifying_key()
            .verify(
                format!("{}.{}", parts[0], parts[1]).as_bytes(),
                &Signature::from_slice(&signature).expect("the signature parses"),
            )
            .expect("the token verifies against the VAPID key");
    }

    #[test]
    fn the_jwt_is_frozen() {
        let token = vapid()
            .authorization("https://fcm.googleapis.com/fcm/send/abc", 1_700_000_000)
            .expect("the endpoint has an origin");

        assert_eq!(
            token,
            "vapid t=eyJ0eXAiOiJKV1QiLCJhbGciOiJFUzI1NiJ9.eyJhdWQiOiJodHRwczovL2ZjbS5nb29nbGVhcGlzLmNvbSIsImV4cCI6MTcwMDA0MzIwMCwic3ViIjoibWFpbHRvOm9wc0BtZW51emEudGVzdCJ9.YckAgG60vnp4rHqZdkr1vFn7Y5Nr8thEQya0d3wYBXOy0b4jzkGe6v-QMg-GyOTUbIuWQK2M7Yop45bjHWzXtQ, k=BG_wO5SSQc4drdQ1GeaWDgqFtBppoFwygQOqK84VlMoWPE91OlW_AdxT9sCwx-7ni0DG_30lqW4igrmJzvccFEo"
        );
    }

    #[test]
    fn a_mismatched_public_key_is_refused() {
        let other = Sec1Point::from(
            &SecretKey::from_slice(&[9u8; 32])
                .expect("valid")
                .public_key(),
        );

        assert!(matches!(
            Vapid::from_parts(
                "mailto:ops@menuza.test",
                &encode(other.as_bytes()),
                &encode(&VAPID_PRIVATE)
            ),
            Err(SenderError::Keys)
        ));
    }

    /// RFC 8291 Appendix A, end to end: the published keys and salt must
    /// reproduce the published body octet for octet.
    #[test]
    fn the_body_matches_the_rfc_8291_vector() {
        let decode = |text: &str| URL_SAFE_PAD_INDIFFERENT.decode(text).expect("base64url");
        let salt: [u8; SALT_BYTES] = decode("DGv6ra1nlYgDCS1FRnbzlw")
            .try_into()
            .expect("16 bytes");
        let ephemeral: [u8; 32] = decode("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw")
            .try_into()
            .expect("32 bytes");
        let ua_public = decode(
            "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
        );
        let auth = decode("BTBZMqHH6r4Tts7J_aSIgg");
        let body = encrypt(
            &ua_public,
            &auth,
            b"When I grow up, I want to be a watermelon",
            &salt,
            &ephemeral,
        )
        .expect("the record seals");

        assert_eq!(
            body,
            decode(
                "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
            )
        );
    }

    #[test]
    fn the_body_is_aes128gcm_with_a_readable_header() {
        let p256dh = ua_public();
        let plaintext = br#"{"title":"Pedido Pronto"}"#;
        let body = encrypt(&p256dh, &AUTH_SECRET, plaintext, &SALT, &EPHEMERAL_SECRET)
            .expect("the record seals");

        assert_eq!(&body[..SALT_BYTES], &SALT);
        assert_eq!(body[SALT_BYTES..SALT_BYTES + 4], RECORD_SIZE.to_be_bytes());
        assert_eq!(body[SALT_BYTES + 4] as usize, POINT_BYTES);

        let ephemeral = SecretKey::from_slice(&EPHEMERAL_SECRET).expect("the scalar is valid");
        let ephemeral_public = Sec1Point::from(&ephemeral.public_key());

        assert_eq!(
            &body[SALT_BYTES + 5..HEADER_BYTES],
            ephemeral_public.as_bytes()
        );
        assert_eq!(body.len(), HEADER_BYTES + plaintext.len() + 1 + 16);
    }

    #[test]
    fn the_body_decrypts_with_the_subscription_key() {
        let p256dh = ua_public();
        let plaintext = br#"{"title":"Pedido Pronto"}"#;
        let body = encrypt(&p256dh, &AUTH_SECRET, plaintext, &SALT, &EPHEMERAL_SECRET)
            .expect("the record seals");

        // Decrypt from the wire bytes alone: header fields, then the record.
        let salt: [u8; SALT_BYTES] = body[..SALT_BYTES].try_into().expect("16 bytes");
        let ephemeral_public = &body[SALT_BYTES + 5..HEADER_BYTES];
        let ephemeral = PublicKey::from_sec1_bytes(ephemeral_public).expect("a valid point");
        let subscription = SecretKey::from_slice(&UA_PRIVATE).expect("the scalar is valid");
        let shared = diffie_hellman(subscription.to_nonzero_scalar(), ephemeral.as_affine());
        let (cek, nonce) = derive_keys(
            shared.raw_secret_bytes(),
            &AUTH_SECRET,
            &p256dh,
            ephemeral_public,
            &salt,
        )
        .expect("the schedule derives");

        let opened = Aes128Gcm::new(&Key::<Aes128Gcm>::from(cek))
            .decrypt(&Nonce::from(nonce), &body[HEADER_BYTES..])
            .expect("the tag verifies");

        let mut expected = plaintext.to_vec();
        expected.push(0x02);

        assert_eq!(opened, expected);
    }

    #[tokio::test]
    async fn a_disallowed_endpoint_never_reaches_the_network() {
        let target = super::PushSubscription {
            endpoint: "https://127.0.0.1/push",
            p256dh: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
            auth: "BTBZMqHH6r4Tts7J_aSIgg",
        };

        assert!(matches!(
            super::send(&vapid(), &target, b"{}").await,
            Err(SenderError::Endpoint)
        ));
    }

    #[test]
    fn an_oversized_payload_is_refused() {
        let p256dh = ua_public();

        assert!(matches!(
            encrypt(
                &p256dh,
                &AUTH_SECRET,
                &[0u8; 4096],
                &SALT,
                &EPHEMERAL_SECRET
            ),
            Err(SenderError::TooLarge)
        ));
    }

    /// The `k=` part is the configured public key, not the derived one.
    fn vapid_public(vapid: &Vapid) -> Vec<u8> {
        URL_SAFE_PAD_INDIFFERENT
            .decode(&vapid.public_key)
            .expect("the key round-trips")
    }
}
