import { writeFileSync } from "node:fs";
import { fetchEncodedAccount, lamports } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  extension,
  fetchMint as fetch2022Mint,
  getMintSize,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { createRuntimeClient } from "#runtime/client";
import {
  ASSETS,
  FUND_AMOUNT_A,
  LOCAL_JSON_PATH,
  RPC_HTTP_URL,
  RPC_WS_URL,
  WRAPPER_PROGRAM_ADDRESS,
} from "#runtime/config";
import { loadOrCreateSigner } from "#runtime/keystore";
import { airdropConfirmed, sendInstructions } from "#runtime/transactions";
import {
  findBackpointerPda,
  findWrappedMintAuthorityPda,
  findWrappedMintPda,
  getCreateMintInstruction,
} from "#runtime/wrap";

const SOL_TOP_UP = 2_000_000_000n;
async function surfnetSetTokenAccount(
  owner: string,
  mint: string,
  amount: bigint,
  tokenProgram: string,
) {
  const response = await fetch(RPC_HTTP_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "surfnet_setTokenAccount",
      params: [owner, mint, { amount: Number(amount) }, tokenProgram],
    }),
  });
  if (!response.ok)
    throw new Error(
      `Surfpool token fixture request failed: HTTP ${response.status}`,
    );
  const result = (await response.json()) as { error?: unknown };
  if (result.error)
    throw new Error(
      `Surfpool token fixture request failed: ${JSON.stringify(result.error)}`,
    );
}
async function main(): Promise<void> {
  const payer = await loadOrCreateSigner("local-payer");
  const userA = await loadOrCreateSigner("user-a");
  const userB = await loadOrCreateSigner("user-b");
  const client = createRuntimeClient(payer);
  await client.rpc
    .getHealth()
    .send()
    .catch((error) => {
      throw new Error(
        `Local RPC unavailable at ${RPC_HTTP_URL}. Start Surfpool first. Cause: ${String(error)}`,
      );
    });
  const programAccount = await fetchEncodedAccount(
    client.rpc,
    WRAPPER_PROGRAM_ADDRESS,
  );
  if (!programAccount.exists || !programAccount.executable)
    throw new Error(
      `Wrapper program not deployed at ${WRAPPER_PROGRAM_ADDRESS}.`,
    );
  for (const signer of [payer, userA, userB])
    if (
      (await client.rpc.getBalance(signer.address).send()).value <
      SOL_TOP_UP / 2n
    )
      await airdropConfirmed(client, signer.address, SOL_TOP_UP);
  const assets = [];
  for (const asset of ASSETS) {
    const mintAccount = await fetchEncodedAccount(client.rpc, asset.mint);
    if (!mintAccount.exists)
      throw new Error(
        `${asset.symbol} mint unavailable from Surfpool datasource: ${asset.mint}`,
      );
    const tokenProgram =
      asset.tokenProgram === "legacy"
        ? TOKEN_PROGRAM_ADDRESS
        : TOKEN_2022_PROGRAM_ADDRESS;
    if (mintAccount.programAddress !== tokenProgram)
      throw new Error(
        `${asset.symbol} has unexpected token program ${mintAccount.programAddress}`,
      );
    const mintData = await fetch2022Mint(client.rpc, asset.mint);
    if (mintData.data.decimals !== asset.decimals)
      throw new Error(
        `${asset.symbol} has unexpected decimals ${mintData.data.decimals}`,
      );
    await surfnetSetTokenAccount(
      userA.address.toString(),
      asset.mint.toString(),
      FUND_AMOUNT_A,
      tokenProgram.toString(),
    );
    await surfnetSetTokenAccount(
      userB.address.toString(),
      asset.mint.toString(),
      0n,
      tokenProgram.toString(),
    );
    const wrappedMint = await findWrappedMintPda(
      WRAPPER_PROGRAM_ADDRESS,
      asset.mint,
      TOKEN_2022_PROGRAM_ADDRESS,
    );
    const backpointer = await findBackpointerPda(
      WRAPPER_PROGRAM_ADDRESS,
      wrappedMint,
    );
    const wrappedMintAuthority = await findWrappedMintAuthorityPda(
      WRAPPER_PROGRAM_ADDRESS,
      wrappedMint,
    );
    if (!(await fetchEncodedAccount(client.rpc, wrappedMint)).exists) {
      const mintSize = BigInt(
        getMintSize([
          extension("ConfidentialTransferMint", {
            autoApproveNewAccounts: true,
            authority: null,
            auditorElgamalPubkey: null,
          }),
          extension("MetadataPointer", {
            authority: null,
            metadataAddress: null,
          }),
        ]),
      );
      const [mintRent, backpointerRent] = await Promise.all([
        client.getMinimumBalance(Number(mintSize)),
        client.getMinimumBalance(32),
      ]);
      await sendInstructions(client, payer, [
        getTransferSolInstruction({
          source: payer,
          destination: wrappedMint,
          amount: lamports(mintRent),
        }),
        getTransferSolInstruction({
          source: payer,
          destination: backpointer,
          amount: lamports(backpointerRent),
        }),
        getCreateMintInstruction(WRAPPER_PROGRAM_ADDRESS, {
          wrappedMint,
          backpointer,
          unwrappedMint: asset.mint,
          wrappedTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
        }),
      ]);
    }
    const [escrow] = await findAssociatedTokenPda({
      owner: wrappedMintAuthority,
      mint: asset.mint,
      tokenProgram,
    });
    await sendInstructions(client, payer, [
      getCreateAssociatedTokenIdempotentInstruction({
        payer,
        ata: escrow,
        owner: wrappedMintAuthority,
        mint: asset.mint,
        tokenProgram,
      }),
    ]);
    assets.push({
      symbol: asset.symbol,
      mint: asset.mint.toString(),
      decimals: asset.decimals,
      tokenProgram: tokenProgram.toString(),
      wrapped: {
        mint: wrappedMint.toString(),
        escrow: escrow.toString(),
        mintAuthority: wrappedMintAuthority.toString(),
        backpointer: backpointer.toString(),
      },
    });
  }
  writeFileSync(
    LOCAL_JSON_PATH,
    `${JSON.stringify({ rpcHttpUrl: RPC_HTTP_URL, rpcWsUrl: RPC_WS_URL, wrapperProgram: WRAPPER_PROGRAM_ADDRESS.toString(), assets, users: { a: userA.address.toString(), b: userB.address.toString() } }, null, 2)}\n`,
  );
  console.log(`Wrote ${LOCAL_JSON_PATH}`);
}
main().catch((error) => {
  console.error(
    `setup failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
