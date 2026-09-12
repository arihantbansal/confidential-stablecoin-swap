#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"
cargo build-sbf --manifest-path vendor/token-wrap/program/Cargo.toml --sbf-out-dir "$repo_root/target/deploy" --tools-version v1.57 -- --locked
