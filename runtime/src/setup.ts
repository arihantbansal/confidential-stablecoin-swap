import { writeFileSync } from "node:fs";
import { fetchEncodedAccount, lamports } from "@solana/kit";
import { getTransferSolInstruction } from "@solana-program/system";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getCreateMintInstructionPlan,
  getMintToInstruction,
  getTokenDecoder,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  extension,
  fetchMint as fetchLegacyMint,
  getMintSize,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { createRuntimeClient } from "#runtime/client";
import {
  FUND_AMOUNT_A,
  LOCAL_JSON_PATH,
  RPC_HTTP_URL,
  RPC_WS_URL,
  TEST_USD_DECIMALS,
  WRAPPER_PROGRAM_ADDRESS,
} from "#runtime/config";
import { loadOrCreateSigner } from "#runtime/keystore";
import { airdropConfirmed, sendInstructions, sendPlan } from "#runtime/send";
import {
  findBackpointerPda,
  findWrappedMintAuthorityPda,
  findWrappedMintPda,
  getCreateMintInstruction,
} from "#runtime/wrapInstructions";

const SOL_TOP_UP = 2_000_000_000n;

async function main(): Promise<void> {
  const payer = await loadOrCreateSigner("local-payer");
  const mintAuthority = await loadOrCreateSigner("mint-authority");
  const userA = await loadOrCreateSigner("user-a");
  const userB = await loadOrCreateSigner("user-b");
  const testUsdMint = await loadOrCreateSigner("test-usd-mint");

  const client = createRuntimeClient(payer);

  let rpcVersion: string;
  try {
    await client.rpc.getHealth().send();
    rpcVersion = (await client.rpc.getVersion().send())["solana-core"];
  } catch (error) {
    throw new Error(
      `Local RPC unavailable at ${RPC_HTTP_URL}. Start Surfpool first. Cause: ${String(error)}`,
    );
  }

  const programAccount = await fetchEncodedAccount(
    client.rpc,
    WRAPPER_PROGRAM_ADDRESS,
  );
  if (!programAccount.exists || !programAccount.executable) {
    throw new Error(
      `Wrapper program not deployed at ${WRAPPER_PROGRAM_ADDRESS}.`,
    );
  }

  for (const signer of [payer, mintAuthority, userA, userB]) {
    const balance = (await client.rpc.getBalance(signer.address).send()).value;
    if (balance < SOL_TOP_UP / 2n) {
      await airdropConfirmed(client, signer.address, SOL_TOP_UP);
    }
  }

  // Test USD: legacy SPL mint, 6 decimals, mintAuthority set, no freeze authority.
  const unwrappedMint = testUsdMint.address;
  const existingMint = await fetchEncodedAccount(client.rpc, unwrappedMint);
  if (!existingMint.exists) {
    const plan = await getCreateMintInstructionPlan(client, {
      payer,
      newMint: testUsdMint,
      decimals: TEST_USD_DECIMALS,
      mintAuthority: mintAuthority.address,
    });
    await sendPlan(client, plan);
  }
  const mintData = await fetchLegacyMint(client.rpc, unwrappedMint);
  if (mintData.data.decimals !== TEST_USD_DECIMALS) {
    throw new Error("Test USD mint has unexpected decimals");
  }
  if (mintData.data.freezeAuthority.__option !== "None") {
    throw new Error("Test USD mint must have no freeze authority");
  }

  const [ataA] = await findAssociatedTokenPda({
    owner: userA.address,
    mint: unwrappedMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const [ataB] = await findAssociatedTokenPda({
    owner: userB.address,
    mint: unwrappedMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  await sendInstructions(client, payer, [
    getCreateAssociatedTokenIdempotentInstruction({
      payer,
      ata: ataA,
      owner: userA.address,
      mint: unwrappedMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    }),
    getCreateAssociatedTokenIdempotentInstruction({
      payer,
      ata: ataB,
      owner: userB.address,
      mint: unwrappedMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    }),
  ]);

  const ataAAccount = await fetchEncodedAccount(client.rpc, ataA);
  let balanceA = 0n;
  if (ataAAccount.exists) {
    balanceA = getTokenDecoder().decode(ataAAccount.data).amount;
  }
  if (balanceA < FUND_AMOUNT_A) {
    await sendInstructions(client, payer, [
      getMintToInstruction({
        mint: unwrappedMint,
        token: ataA,
        mintAuthority,
        amount: FUND_AMOUNT_A - balanceA,
      }),
    ]);
  }

  const wrappedMint = await findWrappedMintPda(
    unwrappedMint,
    TOKEN_2022_PROGRAM_ADDRESS,
  );
  const backpointer = await findBackpointerPda(wrappedMint);
  const wrappedMintAuthority = await findWrappedMintAuthorityPda(wrappedMint);
  const wrappedMintAccount = await fetchEncodedAccount(client.rpc, wrappedMint);
  if (!wrappedMintAccount.exists) {
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
    const backpointerSize = 32n;
    const [mintRent, backpointerRent] = await Promise.all([
      client.getMinimumBalance(Number(mintSize)),
      client.getMinimumBalance(Number(backpointerSize)),
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
      getCreateMintInstruction({
        wrappedMint,
        backpointer,
        unwrappedMint,
        wrappedTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      }),
    ]);
  }

  const [escrow] = await findAssociatedTokenPda({
    owner: wrappedMintAuthority,
    mint: unwrappedMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  await sendInstructions(client, payer, [
    getCreateAssociatedTokenIdempotentInstruction({
      payer,
      ata: escrow,
      owner: wrappedMintAuthority,
      mint: unwrappedMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    }),
  ]);

  const slot = await client.rpc.getSlot().send();
  const manifest = {
    network: "local",
    rpcHttpUrl: RPC_HTTP_URL,
    rpcWsUrl: RPC_WS_URL,
    solanaCore: rpcVersion,
    slot: slot.toString(),
    wrapperProgram: WRAPPER_PROGRAM_ADDRESS.toString(),
    token2022Program: TOKEN_2022_PROGRAM_ADDRESS.toString(),
    legacyTokenProgram: TOKEN_PROGRAM_ADDRESS.toString(),
    testUsd: {
      name: "Test USD",
      mint: unwrappedMint.toString(),
      decimals: TEST_USD_DECIMALS,
      freezeAuthority: null,
      mintAuthority: mintAuthority.address.toString(),
      accountA: ataA.toString(),
      accountB: ataB.toString(),
    },
    wrapped: {
      mint: wrappedMint.toString(),
      backpointer: backpointer.toString(),
      mintAuthority: wrappedMintAuthority.toString(),
      escrow: escrow.toString(),
    },
    users: {
      a: userA.address.toString(),
      b: userB.address.toString(),
    },
    note: "Test tokens only. No real value. Local Surfpool only.",
  };
  writeFileSync(LOCAL_JSON_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Wrote ${LOCAL_JSON_PATH}`);
  console.log(`Test USD mint: ${unwrappedMint}`);
  console.log(`Wrapped mint:  ${wrappedMint}`);
  console.log(`Escrow:        ${escrow}`);
}

main().catch((error) => {
  console.error(
    `setup failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
