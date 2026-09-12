#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"
"$repo_root/scripts/build-wrapper.sh"
for fixture in test-transfer-hook test-metadata-owner; do
  cargo build-sbf --manifest-path "vendor/token-wrap/program/$fixture/Cargo.toml" --sbf-out-dir "$repo_root/target/deploy" --tools-version v1.57 -- --locked
done
SBF_OUT_DIR="$repo_root/target/deploy" cargo test --manifest-path vendor/token-wrap/program/Cargo.toml --locked
