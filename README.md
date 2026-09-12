# Confidential stablecoin swap

Wrap USDC, USDT, and CASH 1:1 and send them with native Token-2022 confidential transfers. Each asset has its own wrapper.

Runs on local Surfpool with copies of mainnet mints. All transactions stay local.

![Confidential stablecoin swap UI](assets/screenshot.png)

## Setup

Requires Node.js 24+, pnpm 10.15.0, Rust, Solana CLI 4.1.0 with `cargo build-sbf`, and Surfpool 1.5.0. The build pins SBF platform tools to v1.57.

```sh
git clone https://github.com/arihantbansal/confidential-stablecoin-swap.git
cd confidential-stablecoin-swap
pnpm install
pnpm local:build
pnpm local:start
```

Leave Surfpool running. In a second terminal:

```sh
pnpm local:setup
pnpm dev
```

Open http://127.0.0.1:5173. Surfpool serves RPC on port 8899 and WebSocket on 8900.

`local:setup` deploys the wrapper locally and prepares the mint copies. It stores local keys in `.keys/` and deployment addresses in `runtime/local.json`. Both are gitignored.

## Use

1. Connect a Solana wallet or choose **Use a test wallet**.
2. Choose an asset beside the amount field.
3. Click your wallet address, then **Get USDC**, **Get USDT**, or **Get CASH** to top up that asset to 100. This also adds SOL when needed. Test wallets start funded for the selected asset.
4. Use **Convert** to move between public and confidential balances. Flip the direction to convert back. Use **Send** to transfer confidential funds.

Incoming funds appear above the form, grouped by asset. Choose **Add to balance** to make them spendable. Amounts appear after you unlock the asset's confidential keys.

If confirmation is unknown, choose **Check status**. New transactions stay blocked until the outcome is known, even after disconnect. Keep the page open: receipts live in memory, and a timeout does not mean the transaction failed.

Test wallets also live in page memory. Reloading or disconnecting deletes them.

## Checks

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

With Surfpool running, replenish the fixtures before each roundtrip:

```sh
pnpm local:setup
pnpm local:roundtrip
bash scripts/test-wrapper.sh
```

The roundtrip wraps, deposits, sends, withdraws, and unwraps all three assets, then checks token accounting. The wrapper script runs the upstream Rust tests.

## Limits

- This project has not been audited. Upstream audits do not cover this app or establish the safety of this deployment.
- [The local deployment check](research/local-deployment.json) compares the deployed program with the local artifact. It does not establish a reproducible build.
- USDC and USDT mint copies retain issuer freeze controls. CASH retains its permanent delegate. The wrappers also retain freeze controls.
- Local funding uses a development-only cheatcode endpoint on the localhost app.
- Confidential amounts and balances are encrypted. Addresses, timing, wrapping, deposits, withdrawals, and redemptions remain public.

## License

[MIT](LICENSE). Vendored Token Wrap code retains its [upstream license](vendor/token-wrap/LICENSE). Geist uses the [SIL Open Font License](web/public/fonts/Geist-LICENSE.txt). [Token logo sources](web/src/lib/token-icons.ts) are recorded in the code.
