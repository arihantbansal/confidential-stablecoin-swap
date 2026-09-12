# Project working agreement

## Implementation

- Use native Token-2022 confidential transfers and the official proof SDK. Record vendored source revisions and local changes in the README.
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
- Use Convert and Send as modes. Label conversion actions Make confidential and Make public. Explain failures with a cause and a next step.
- Write plain, specific copy. Remove slogans, filler, decorative status claims, and comments that merely repeat code.
- Keep test-token scope in the README. Security claims must link to evidence for the exact scope and version.
- Show real balances, signatures, and statuses. Keep simulations explicitly separate from transaction results.

## References

Use the README for setup, usage, and limitations. Support audit and deployment-verification claims with evidence for the exact build.
