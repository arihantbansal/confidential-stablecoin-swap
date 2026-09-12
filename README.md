# Confidential stablecoin

A local Surfpool experiment that wraps Test USD into a Token-2022 token and uses native confidential transfers. Test tokens have no monetary value.

The browser app and two-user confidential round trip run locally. Browser testing covered conversion, a confidential payment between two independent test wallets, accepting the payment, and both redemptions. This application is not audited or formally verified.

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

Surfpool listens on `127.0.0.1:8899`. Its mainnet setting supplies upstream accounts on demand; all writes and test transactions execute locally. The fixture loader installs our compiled wrapper at its fixed local address without distributing a deployment secret.

Creating a test wallet adds 100 Test USD and enables confidential receiving. Use Convert, Send, and Withdraw; Account contains the address, test funding, and encrypted recovery export. Wallet keys live in memory, so export a recovery file before closing the tab if you want to keep that test identity.

Transaction outcomes use Sonner notifications, with signatures and errors available through Details. Field errors appear after leaving a field or submitting; editing clears them. Enter opens the transaction review. Motion respects reduced-motion preferences.

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

The upstream wrapper suite passed 114 tests with one ignored. The local native proof round trip wraps 100, sends 30 from A to B, redeems 30 and 70, and checks that escrow and wrapped supply return to their starting values. Runtime transaction signatures and assertions are written to `runtime/results.json`; keys stay in ignored `.keys/` files.

The compiled wrapper was downloaded from the local deployment and matched byte for byte. That establishes this local artifact match, not independent reproducibility or a security audit. See `research/local-deployment.json` and `research/wrapper-tests.json`.

Browser proofs use the official WASM SDK. The current build loads about 2.7 MB of WASM and runs proof generation on the browser thread; moving it to a worker is a remaining performance improvement. Injected-wallet integration uses Wallet Standard but has not been exercised against a real wallet extension.

## Trust boundaries

The vendored wrapper comes from the official Solana program repository. Upstream audits cover named revisions, not automatically our pinned revision or application. The initial normal local deployment retains an upgrade authority. Immutability has not been established. The browser integration, proof SDK, recovery handling, and dependency chain need their own review. Do not describe this experiment as audited, formally verified, or production ready.

Read [the build plan](docs/build-plan.md) for architecture and remaining acceptance criteria, [the evidence](docs/evidence.md) for upstream findings, and [vendor provenance](vendor/PROVENANCE.json) for the pinned source and local program-ID change.
