# Project working agreement

## Implementation

- Use native Token-2022 confidential transfers and the official proof SDK. Keep wrapper changes recorded in `vendor/PROVENANCE.json`.
- Run transactions only against the local Surfpool endpoint. A fork's remote datasource is read-only.
- Preserve signature, blockhash, and proof verification. Seed local fixtures before the lifecycle; use real instructions during the acceptance test.
- Keep keys out of source, browser-served directories, logs, and plaintext browser persistence. Local test identities have no monetary value.
- Use the configured import aliases and Biome checks. Import modules directly; introduce a shared abstraction only when behavior actually needs it.
- Keep cryptography and transaction state outside UI components. Unknown balances remain unknown. Report confirmation only after checking the chain.
- Retry from observed transaction/account state. Never equate an RPC timeout with a failed transaction.
- Build working behavior before expanding checks. Keep focused tests for token accounting; remove duplicate helpers, unused exports, and validation of hard-coded values.
- Use the repository scripts for checks. Preserve upstream tests and licenses. Commit and publish only when requested.

## Interface and writing

- Use themed shadcn/ui components and semantic tokens. Preserve keyboard behavior and visible focus.
- Name actions consistently: Convert, Send, Withdraw. Explain failures with a cause and a next step.
- Write plain, specific copy. Remove slogans, filler, decorative status claims, and comments that merely repeat code.
- Show the local test-token label. Security claims must link to evidence for the exact scope and version.
- Show real balances, signatures, and statuses. Keep simulations explicitly separate from transaction results.

## References

Read `docs/build-plan.md` when changing the transaction lifecycle or recovery design. Read `docs/evidence.md` when making audit or deployment-verification claims. The README describes the runnable state; the plan may include unfinished work.
