//! Argon2id password hashing, mirroring `apps/orpc-server/src/auth/password.ts`.

use argon2::password_hash::{PasswordHasher, PasswordVerifier};
use argon2::{Algorithm, Argon2, Params, Version};

/// 64 MiB, matching `Bun.password`'s `memoryCost: 65536`.
pub const ARGON2_MEMORY_KIB: u32 = 65_536;
/// Three iterations, matching `Bun.password`'s `timeCost: 3`.
pub const ARGON2_TIME_COST: u32 = 3;
/// One lane, which is what the Bun backend uses when no cost is passed.
pub const ARGON2_PARALLELISM: u32 = 1;

#[derive(Debug, thiserror::Error)]
pub enum PasswordError {
    #[error("failed to hash password")]
    Hash,
    #[error("invalid password hash")]
    InvalidHash,
}

fn hasher() -> Result<Argon2<'static>, PasswordError> {
    let params = Params::new(
        ARGON2_MEMORY_KIB,
        ARGON2_TIME_COST,
        ARGON2_PARALLELISM,
        None,
    )
    .map_err(|_| PasswordError::Hash)?;

    Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
}

/// Hashes with argon2id and a fresh random salt, so two calls with the same
/// password never produce the same string.
pub fn hash_password(password: &str) -> Result<String, PasswordError> {
    let hash = hasher()?
        .hash_password(password.as_bytes())
        .map_err(|_| PasswordError::Hash)?;

    Ok(hash.to_string())
}

/// Fails closed: a missing hash (bot or Google-only account), a malformed or
/// foreign hash, and a wrong password all return `false`, never an error.
pub fn verify_password(password: &str, hash: Option<&str>) -> bool {
    let Some(hash) = hash else {
        return false;
    };

    let Ok(hasher) = hasher() else {
        return false;
    };

    hasher.verify_password(password.as_bytes(), hash).is_ok()
}
