# Confidential stablecoin

Local Token-2022 confidential-transfer experiment. Test USD only, no monetary value. All transactions run on local Surfpool.

## Prerequisites

Node.js 24+, pnpm 10, Rust, Solana CLI with `cargo build-sbf`, Surfpool. Used Surfpool 1.5.0 with SBF platform tools v1.57.

## Run locally

```sh
git clone https://github.com/arihantbansal/confidential-stablecoin-swap.git
cd confidential-stablecoin-swap
pnpm install
pnpm local:build
pnpm local:start
```

Keep Surfpool running. In a second terminal, open the cloned directory:

```sh
pnpm local:setup
pnpm dev
```

App: `http://127.0.0.1:5173`. Surfpool RPC: `http://127.0.0.1:8899` (WS `8900`). `local:setup` creates the Test USD mint, wrapper fixtures, and ignored local keys in `.keys/`.

## Use

Connect wallet in the header, then use a test wallet or an installed wallet. Test wallets live in page memory only. Reload or disconnect discards the identity.

Convert uses one amount field with a Public → Confidential direction row and flip. The button reads Make confidential or Make public. Send is separate, with recipient address and confidential amount.

The account modal shows public and confidential balances, copy address, Get test dollars, and Disconnect. Funding replenishes public Test USD to 100 and prepares confidential receiving.

Incoming transfers need Accept. Finish conversion appears when public wrapped tokens remain. Amounts accept up to 6 decimals. Success offers View transaction on Solana Explorer with a custom cluster pointing at the local RPC. Enter opens transaction review.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm local:roundtrip
```

Run the round trip against the running local instance. It converts 100 Test USD, sends 30 between two wallets, redeems both balances, and checks that escrow and supply return to their starting values. Run `bash scripts/test-wrapper.sh` for the upstream Rust tests.

For browser testing, open two tabs and connect a different test wallet in each. Convert in the first, send to the second wallet's address, accept the payment, and convert back to public.

## Limits

Confidential-transfer amounts and confidential balances are encrypted; addresses and timing are public. Wrapping, deposits, withdrawals, and redemptions are public.

Not audited. Upstream wrapper audits do not automatically cover this revision, app, or deployment. The pinned upstream source and local changes are recorded in [vendor provenance](vendor/PROVENANCE.json).

The official proof SDK loads about 2.7 MB of WASM and currently generates proofs on the browser thread. Wallet Standard integration still needs testing with a real extension.

## License

[MIT](LICENSE). Vendored Token Wrap code retains its [upstream license](vendor/token-wrap/LICENSE).
