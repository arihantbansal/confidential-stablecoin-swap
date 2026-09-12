#!/usr/bin/env bash
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$repo_root/work/surfpool"
cd "$repo_root/work/surfpool"
exec surfpool start --network mainnet --host 127.0.0.1 --port 8899 --ws-port 8900 --no-deploy --airdrop-amount 0 --no-tui
