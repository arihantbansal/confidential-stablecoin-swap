# Confidential stablecoin

A local Surfpool experiment that wraps Test USD into a Token-2022 token and uses native confidential transfers. Test tokens have no monetary value.

The app and a two-user confidential round trip run locally. An earlier browser build covered conversion, a confidential payment between two independent test wallets, receipt acceptance, and both redemptions. The current two-panel UI has also completed conversion in both directions; its two-wallet send check remains outstanding.

## Run locally

Requirements: Node.js 24+, pnpm 10, Rust, Solana CLI with `cargo build-sbf`, and Surfpool. Development used Surfpool 1.5.0 and SBF platform tools 1.57. The first Rust build downloads its pinned dependencies and toolchain.

```sh
pnpm install
pnpm local:build
pnpm local:start
```

Keep Surfpool running. In another terminal:

```sh
pnpm local:setup
pnpm dev
```

Surfpool listens on `127.0.0.1:8899`. Its mainnet setting supplies upstream accounts on demand; all writes and test transactions execute locally. The fixture loader installs the compiled wrapper at its fixed local address without distributing a deployment secret.

Connect wallet in the header opens a chooser with detected wallets and a local test wallet option. Test wallets live in page memory. Reloading or disconnecting discards the identity. The connected header address opens the account dialog with the address, copy, Get test dollars, and disconnect. Funding replenishes the public Test USD balance to 100 and prepares the account for confidential receiving.

Convert has Public and Confidential Test USD panels with a flip button. Flipping to Confidential to Public still runs a withdraw internally. Send takes a recipient address and a confidential amount. Amounts accept up to 6 decimals, including `.5` and `1.` forms. Each panel labels its public or confidential balance. An Accept button shows incoming funds that are still pending. A Finish conversion button appears when public wrapped tokens remain after an interrupted reverse conversion.

Success toasts offer View transaction, which opens Solana Explorer with `cluster=custom` and `customUrl=http://127.0.0.1:8899`. Errors offer Details with a cause and next step. Enter opens the transaction review.

## What is private

The Token-2022 confidential balance and transfer amount are encrypted. Addresses and transaction timing remain visible. Wrapping, deposits, withdrawals, redemption amounts, escrow, and total supply are public. This is amount confidentiality, not anonymous payments.

The wrapper holds one underlying token in escrow and issues a matching receipt token. This experiment uses one Test USD mint. Supporting USDC, USDT, and CASH would require separate wrappers or an explicit conversion into one chosen backing asset; those assets are not interchangeable claims.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm local:roundtrip
./scripts/test-wrapper.sh
```

The upstream wrapper suite passed 114 tests with one ignored. The local native proof round trip wraps 100, sends 30 from A to B, redeems 30 and 70, and checks that escrow and wrapped supply return to their starting values. Runtime transaction signatures and assertions are written to `runtime/results.json`; keys stay in ignored `.keys/` files. Finish conversion and injected-wallet acceptance remain open. See the testing plan for the current checklist.

The compiled wrapper was downloaded from the local deployment and matched byte for byte. That establishes this local artifact match, not independent reproducibility or a security audit. See `research/local-deployment.json` and `research/wrapper-tests.json`.

Browser proofs use the official WASM SDK. The current build loads about 2.7 MB of WASM and runs proof generation on the browser thread; moving it to a worker is a remaining performance improvement. Injected-wallet integration uses Wallet Standard but has not been exercised against a real wallet extension.

## Trust boundaries

The vendored wrapper comes from the official Solana program repository. Upstream audits cover named revisions, not automatically our pinned revision or application. The initial normal local deployment retains an upgrade authority. Immutability has not been established. The application is not audited or formally verified.

Read [the build plan](docs/build-plan.md) for architecture and remaining acceptance criteria, [the evidence](docs/evidence.md) for upstream findings, and [vendor provenance](vendor/PROVENANCE.json) for the pinned source and local program-ID change.
