# Evidence and limitations

Inspected on 2026-09-12. This is engineering due diligence, not an independent security audit.

## Upstream references

The [Token Wrap documentation](https://www.solana-program.com/docs/token-wrap) lists Zellic's 2025-05-16 audit at `75c5529`, Runtime Verification's 2025-06-11 audit at `dd71fc1`, and its 2025-10-30 audit at `228dc97`. The report listing is verified; a complete finding-by-finding assessment has not been performed here. The full reports have not been reviewed.

GitHub's comparison of `228dc97...cc01d3988fb300628ee4d04f4af93d16c8d56732` returned 275 commits ahead and 134 changed files. This includes tooling and client changes, not 275 security defects. It means the listed audit does not automatically cover the chosen current revision.

[Comparison](https://github.com/solana-program/token-wrap/compare/228dc97...cc01d3988fb300628ee4d04f4af93d16c8d56732).

The [default mint customizer](https://github.com/solana-program/token-wrap/blob/cc01d3988fb300628ee4d04f4af93d16c8d56732/program/src/mint_customizer/default_token_2022.rs) configures no confidential authority, automatic approval, and no auditor. It copies the underlying freeze authority and decimals.

The [processor](https://github.com/solana-program/token-wrap/blob/cc01d3988fb300628ee4d04f4af93d16c8d56732/program/src/processor.rs) uses public mint/burn for wrapping and redemption. Its account derivations require consistent deployment IDs.

The [confidential-transfer test](https://github.com/solana-program/token-wrap/blob/cc01d3988fb300628ee4d04f4af93d16c8d56732/clients/cli/tests/common/test_confidential_transfers.rs) checks mint configuration only. Its name is not evidence of a full round trip.

[Certora's Token-2022 work](https://www.certora.com/blog/token-extensions-audit) verifies selected properties of specified code. It does not establish that this wrapper, current dependencies, browser code, or deployment are formally verified. An audit, a formal proof, and reproducible deployment verification establish different things. None alone guarantees correctness.

## Devnet status

See `research/devnet-snapshot.json` for the historical finalized RPC response collected during the initial investigation. An executable proof-program account shows availability of an account, not successful proof execution. No Devnet writes or transfer tests were performed during planning.

Our local wrapper uses a new program ID. The publicly documented Token Wrap address is a reference, not an address to send test funds to before a deployment is confirmed.

## Toolchain compatibility

The wrapper revision specifies Rust `1.93.1`, Solana CLI metadata `4.1.0`, Token-2022 `11.0.0`, and pnpm `10.15.1`. The [sample](https://github.com/solana-foundation/Confidential-Balances-Sample) references Token-2022 `10.0.0`, ZK SDK `6.0.1`, and proof-context compatibility workarounds. Do not copy both dependency sets into one project without validation.

Local inspection found Node `24.16.0`, pnpm `11.25.0`, Solana CLI `3.1.10`, and Rust `1.100.0-nightly`. `cargo-build-sbf` and `spl-token` are available; `wasm-pack` was not on PATH. These were the pre-implementation versions. Project dependencies and SBF platform tools were subsequently installed locally.

The [current Solana frontend docs](https://solana.com/docs/frontend) and [Kit React guide](https://www.solanakit.com/docs/guides/react) support the Kit + React + Wallet Standard direction. [Vite](https://vite.dev/guide/) provides the React TypeScript client build. The implementation uses the official TypeScript ZK SDK and Token-2022 confidential instruction plans; dependency versions are recorded in package manifests and lockfiles.

## Current conclusion

The native confidential lifecycle executes successfully on local Surfpool. This supports building a local prototype; it does not establish application security or formal correctness. The current two-panel UI completed conversion in both directions with a disposable test wallet. Two-wallet sending in this layout and interrupted-conversion recovery still need acceptance checks.

## Surfpool and UI revision

Historical Devnet observations above are retained for reference. The implementation targets local Surfpool. Surfpool `1.5.0` is installed; `surfpool start --help` was checked. The initial planning revision ran no proof tests; the implementation results below supersede that status.

[Solana's current transfer guide](https://solana.com/docs/tokens/extensions/confidential-transfer/transfer-tokens) identifies Surfpool as a local environment with the native verifier. It includes `@solana/zk-sdk/bundler`, `getConfidentialTransferInstructionPlan`, and instruction-plan submission. This supersedes the earlier assumption that a custom Rust-to-WASM adapter is the preferred starting point. Browser wallet integration remains to be validated.

[Surfpool CLI](https://docs.surfpool.run/toolchain/cli) documents fork sources, snapshots, and offline mode. [Surfpool SDK](https://solana.com/docs/tools/surfpool/sdk/overview) provides isolated test instances. Documentation alone is not a passed application test.

The UI uses shadcn components and semantic theme tokens. References include the [Vite setup](https://ui.shadcn.com/docs/installation/vite) and [semantic CSS-variable theming](https://ui.shadcn.com/docs/theming) approaches. The implementation includes themed shadcn/ui components; browser integration and visual checks are tracked separately from protocol verification. The test wallet is an in-memory `generateKeyPairSigner`; reload or disconnect loses the identity and there is no recovery file. Proof generation still runs on the browser thread with about 2.7 MB of WASM, and injected-wallet use through Wallet Standard has not been exercised against a real extension.

## Local implementation evidence

The locally compiled wrapper passed 114 upstream tests, with one ignored. See `research/wrapper-tests.json` for counts and the exact command. The deployed bytes matched `target/deploy/spl_token_wrap.so`; see `research/local-deployment.json` for its SHA-256 and program ID. This comparison is local artifact verification, not an independent reproducible build.

The native confidential round trip passed on Surfpool: wrap 100 Test USD, deposit/apply, transfer 30 A to B through native ZK proof verification, apply B, withdraw and redeem 30 B and 70 A. The initial isolated run ended with zero escrow and wrapped supply. Later runs preserve the starting balances of other test wallets. The confidential transfer used the official five-transaction instruction plan. Public transaction signatures and balance assertions are recorded in the ignored `runtime/results.json`.

Clean checkouts can load the compiled local program using [Surfpool's program fixture RPC](https://solana.com/docs/tools/surfpool/rpc/cheatcodes). Fixture loading avoids committing the program keypair. It is distinct from the ordinary signed local deployment used for the recorded initial byte comparison. Token movement and proof verification use normal transactions after setup. The full browser round trip used the earlier tab layout. Current acceptance work is listed in [the testing plan](build-plan.md).
