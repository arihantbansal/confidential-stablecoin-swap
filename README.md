# Confidential stablecoin swap

Convert USDC, USDT, and CASH between public balances and confidential wrappers on local Surfpool. The setup uses mainnet mint copies and keeps writes on the local RPC.

![Confidential stablecoin swap UI](assets/screenshot.png)

## Prerequisites

- Node.js 24 or newer
- pnpm 10.15.0
- Rust and the Solana CLI 4.1.0, with `cargo build-sbf`
- Surfpool 1.5.0
- SBF platform tools v1.57

## Run locally

```sh
git clone https://github.com/arihantbansal/confidential-stablecoin-swap.git
cd confidential-stablecoin-swap
pnpm install
pnpm local:build
pnpm local:start
```

Leave Surfpool running at `http://127.0.0.1:8899` (WebSocket `8900`). In a second terminal, run:

```sh
pnpm local:setup
pnpm dev
```

Open `http://127.0.0.1:5173`. `local:setup` loads the locally built wrapper and prepares the USDC, USDT, and CASH mint copies. It writes ignored local identities and deployment addresses under `.keys/` and `runtime/local.json`.

## Use

1. Connect a wallet.
2. Choose USDC, USDT, or CASH from the asset picker beside the amount field.
3. Use the account dialog's `Get {symbol}` action to top up the selected asset to 100 and add SOL when needed. The wallet dialog also offers a local test wallet funded for the selected asset.
4. Use Convert to move between public and confidential balances, or Send to transfer confidential funds. These actions submit native Token-2022 confidential-transfer instructions and wrapper transactions.

Incoming confidential transfers must be accepted before they become available.

The UI shows public and confidential balances, transaction signatures, and confirmation status from the local chain. Amounts use each mint's decimals. Local identities live in page memory and disappear when you reload or disconnect.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm local:roundtrip
bash scripts/test-wrapper.sh
```

Run `pnpm local:roundtrip` while Surfpool is running. It exercises wrapping, confidential deposit, native confidential transfer, withdrawal, and unwrapping for USDC, USDT, and CASH, then checks token accounting. `scripts/test-wrapper.sh` runs the vendored wrapper's upstream Rust tests.

## Limits

- The local wrapper build has an exact artifact-to-deployment check recorded in `research/local-deployment.json`; that check does not verify an independently reproducible build.
- The project has not been audited. Upstream audits do not automatically cover this revision, the application, or the local deployment.
- Issuer controls remain on the underlying USDC and USDT copies, including freeze controls. CASH retains its underlying permanent-delegate control. The separate wrapper copies retain their freeze controls.
- Local funding is a development-only cheatcode endpoint bound to the localhost app.
- Confidential amounts and balances are encrypted. Addresses, timing, wrapping, deposits, withdrawals, and redemptions remain public.

## License

[MIT](LICENSE). Vendored Token Wrap code retains its [upstream license](vendor/token-wrap/LICENSE). The bundled Geist font is licensed under the [SIL Open Font License](web/public/fonts/Geist-LICENSE.txt), copyright Vercel in collaboration with basement.studio. Token logo sources are listed in `web/src/lib/token-icons.ts`.
