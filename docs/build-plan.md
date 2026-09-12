# Local testing plan

## Scope

The app converts Test USD between public SPL tokens and a Token-2022 confidential balance. Send transfers between confidential accounts. All transactions run on local Surfpool. USDC, USDT, CASH, public-network deployment, and production custody are outside this version.

The underlying mint has six decimals and no freeze authority. Each underlying asset needs its own wrapper unless a separate swap converts it into one backing asset.

## Implementation

- `web/` contains the React app, Wallet Standard connection, official proof SDK, and themed shadcn components.
- `runtime/` creates local fixtures and runs a two-wallet native confidential round trip.
- `vendor/token-wrap/` contains pinned upstream source. The local program-ID change is recorded in `vendor/PROVENANCE.json`.
- `scripts/` builds the program, starts Surfpool, loads fixtures, and runs upstream tests.
- `runtime/local.json` supplies public deployment addresses to the web app. Local keys stay in ignored `.keys/` files.

Convert to confidential wraps collateral and deposits it in one transaction, then applies the pending balance. The reverse direction withdraws to the public wrapped balance and redeems it through the wrapper. These operations can span transactions. The client refreshes balances after an error rather than assuming nothing executed.

Incoming funds appear as pending until accepted. If reverse conversion leaves public wrapped tokens, Finish conversion redeems them. Proof generation runs on the browser thread using the official WASM SDK. There is no custom cryptography or hosted application database.

## Run

Follow the [README setup](../README.md#run-locally). Surfpool uses mainnet as a read-only account source. The app sends to `127.0.0.1:8899`; Studio runs at `127.0.0.1:18488`.

Do not reset a running instance while testing a wallet. A fresh Surfpool instance needs `pnpm local:setup` again. Test-wallet identities live only in page memory. Reloading or disconnecting discards them.

## Verified

- The wrapper suite passed 114 tests with one ignored.
- The native round trip converted 100, sent 30 between wallets, redeemed 30 and 70, and restored escrow and supply to their starting values.
- An earlier browser build completed conversion, confidential send, receipt acceptance, and both redemptions.
- The current two-panel UI completed a 0.5 Test USD conversion in each direction. The source and destination balances updated correctly, and Enter opened review.
- The connection chooser and header account modal were checked in the browser. The layout fits a 375-pixel viewport. Empty amounts disable the action without a red error. Success provides a transaction explorer link.

See [evidence and limitations](evidence.md) for source revisions and verification scope.

## Remaining acceptance

1. Repeat Send and Accept with two independent wallets in the current layout. Confirm the sender and recipient balances before and after redemption.
2. Exercise Finish conversion after an interrupted reverse conversion. Verify it redeems the remaining public wrapped balance without withdrawing it twice.
3. Check an installed Wallet Standard extension: connection, signing, rejection, account change, and disconnect.
4. Verify that Solana Explorer can read the custom local RPC in the tester's browser. Browser local-network permissions may affect access.
5. Check keyboard navigation, narrow layouts, reduced motion, insufficient balance, and a nonempty invalid recipient.

Use existing commands for typechecking, lint, build, and amount tests. Preserve upstream proof and accounting tests. Add a focused regression check when fixing an observed bug, rather than creating a second copy of the upstream test suite.

## Follow-up work

Move proof generation to a worker if it blocks interaction on the target device. Preserve confirmed signatures from partially completed instruction plans so errors can link every submitted transaction. Review proof-context cleanup and concurrent account changes before expanding wallet support.

Production use requires separate review of the selected wrapper revision, dependencies, browser signing, and deployment. An upstream audit or local byte match does not establish that this application is audited, immutable, or formally verified.
