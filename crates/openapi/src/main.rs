//! Emits the committed `commerce.json` and `tenant.json`.
//!
//! `cargo run -p openapi` rewrites both files; `-- --check` compares them with a
//! fresh document and fails on a difference. The comparison parses both sides,
//! so reformatting a file is not drift.

use std::fs;
use std::path::PathBuf;
use std::process::ExitCode;

use serde_json::{Value, json};

fn main() -> ExitCode {
    match std::env::args().nth(1).as_deref() {
        None | Some("--write") => write(),
        Some("--check") => check(),
        Some(_) => {
            eprintln!("usage: openapi [--write | --check]");
            ExitCode::from(2)
        }
    }
}

/// Writes both documents over the committed files.
fn write() -> ExitCode {
    for (name, document) in documents() {
        let mut generated = serde_json::to_string_pretty(&document).expect("document serialises");
        generated.push('\n');

        if let Err(error) = fs::write(path(name), generated) {
            eprintln!("{}: {error}", path(name).display());
            return ExitCode::FAILURE;
        }
    }

    ExitCode::SUCCESS
}

/// Fails when a committed file and its generated document differ.
fn check() -> ExitCode {
    let mut up_to_date = true;

    for (name, generated) in documents() {
        // A missing or unreadable file parses as `null`, which never matches.
        let committed = fs::read_to_string(path(name)).unwrap_or_default();
        let committed: Value = serde_json::from_str(&committed).unwrap_or(Value::Null);

        if generated != committed {
            eprintln!("{name}.json");
            up_to_date = false;
        }
    }

    if up_to_date {
        println!("openapi up to date");
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}

/// Both documents, parsed and carrying the `servers` entry the retired
/// documents declare: the generated paths are unprefixed, so consumers rely on
/// the same base URL.
fn documents() -> [(&'static str, Value); 2] {
    let commerce = with_servers(
        serde_json::to_value(api_commerce::openapi()).expect("commerce document is JSON"),
    );
    let tenant =
        with_servers(serde_json::to_value(api_tenant::openapi()).expect("tenant document is JSON"));

    [("commerce", commerce), ("tenant", tenant)]
}

/// Adds the base URL when the document does not declare one already.
fn with_servers(mut document: Value) -> Value {
    if let Value::Object(fields) = &mut document {
        fields
            .entry("servers")
            .or_insert_with(|| json!([{ "url": "/openapi" }]));
    }

    document
}

/// Resolved from the crate, not the process working directory.
fn path(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!("{name}.json"))
}
