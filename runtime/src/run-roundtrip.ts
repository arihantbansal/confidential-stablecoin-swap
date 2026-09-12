import { readFileSync, writeFileSync } from "node:fs";
import {
  type Address,
  address,
  fetchEncodedAccount,
  type KeyPairSigner,
} from "@solana/kit";
import {
  AeKey,
  ElGamalKeypair,
  ElGamalSecretKey,
} from "@solana/zk-sdk/bundler";
import {
  findAssociatedTokenPda as findLegacyAta,
  getTokenDecoder as getLegacyTokenDecoder,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  fetchMint as fetchToken2022Mint,
  fetchToken as fetchToken2022Token,
  findAssociatedTokenPda as findToken2022Ata,
  getConfidentialDepositInstruction,
  getTokenDecoder as getToken2022Decoder,
  TOKEN_2022_PROGRAM_ADDRESS,
  type Token,
} from "@solana-program/token-2022";
import {
  deriveAeKeyForOwnerMint,
  deriveElGamalKeypairForOwnerMint,
  fetchConfidentialTransferBalance,
  getApplyConfidentialPendingBalanceInstructionFromToken,
  getConfidentialTransferInstructionPlan,
  getConfidentialWithdrawInstructionPlan,
  getCreateConfidentialTransferAccountInstructionPlan,
} from "@solana-program/token-2022/confidential";
import { createRuntimeClient } from "#runtime/client";
import {
  FUND_AMOUNT_A,
  LOCAL_JSON_PATH,
  REDEEM_AMOUNT_A,
  RESULTS_JSON_PATH,
  TRANSFER_AMOUNT_B,
  WRAPPER_PROGRAM_ADDRESS,
} from "#runtime/config";
import { loadOrCreateSigner } from "#runtime/keystore";
import {
  sendInstructions,
  sendPlanConfirmed as sendPlan,
} from "#runtime/transactions";
import {
  findWrappedMintAuthorityPda,
  getUnwrapInstruction,
  getWrapInstruction,
} from "#runtime/wrap";

interface Manifest {
  assets: Array<{
    symbol: string;
    mint: string;
    decimals: number;
    tokenProgram: string;
    wrapped: { mint: string; escrow: string; mintAuthority: string };
  }>;
  users: { a: string; b: string };
}

interface StepRecord {
  name: string;
  signatures: string[];
  detail: string;
}

async function deriveKeys(
  signer: KeyPairSigner,
  owner: Address,
  mint: Address,
): Promise<{
  elgamalKeypair: ElGamalKeypair;
  elgamalSecretKey: ElGamalSecretKey;
  aesKey: AeKey;
}> {
  const derived = await deriveElGamalKeypairForOwnerMint({
    signer,
    owner,
    mint,
  });
  const elgamalSecretKey = ElGamalSecretKey.fromBytes(derived.secretKey);
  const elgamalKeypair = ElGamalKeypair.fromSecretKey(elgamalSecretKey);
  const aesKey = AeKey.fromBytes(
    await deriveAeKeyForOwnerMint({ signer, owner, mint }),
  );
  return { elgamalKeypair, elgamalSecretKey, aesKey };
}

function hasConfidentialExtension(tokenData: Token): boolean {
  if (tokenData.extensions.__option !== "Some") return false;
  return tokenData.extensions.value.some(
    (ext) => ext.__kind === "ConfidentialTransferAccount",
  );
}

async function fetchTokenBalanceStrict(
  client: ReturnType<typeof createRuntimeClient>,
  label: string,
  token: Address,
): Promise<bigint> {
  const account = await fetchEncodedAccount(client.rpc, token);
  if (!account.exists) {
    throw new Error(`Required token account absent: ${label}`);
  }
  if (account.programAddress === TOKEN_PROGRAM_ADDRESS) {
    return getLegacyTokenDecoder().decode(account.data).amount;
  }
  return getToken2022Decoder().decode(account.data).amount;
}

async function fetchMintSupply(
  client: ReturnType<typeof createRuntimeClient>,
  mint: Address,
): Promise<bigint> {
  return (await fetchToken2022Mint(client.rpc, mint)).data.supply;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  const manifest = JSON.parse(
    readFileSync(LOCAL_JSON_PATH, "utf8"),
  ) as Manifest;
  const payer = await loadOrCreateSigner("local-payer");
  const userA = await loadOrCreateSigner("user-a");
  const userB = await loadOrCreateSigner("user-b");
  const client = createRuntimeClient(payer);
  const allSteps: StepRecord[] = [];
  const allAssertions: unknown[] = [];
  for (const asset of manifest.assets) {
    const unwrappedMint = address(asset.mint);
    const wrappedMint = address(asset.wrapped.mint);
    const escrow = address(asset.wrapped.escrow);
    const underlyingProgram = address(asset.tokenProgram);
    const [ataA] = await findLegacyAta({
      owner: userA.address,
      mint: unwrappedMint,
      tokenProgram: underlyingProgram,
    });
    const [ataB] = await findLegacyAta({
      owner: userB.address,
      mint: unwrappedMint,
      tokenProgram: underlyingProgram,
    });

    const steps: StepRecord[] = [];
    const record = (name: string, signatures: string[], detail: string) => {
      steps.push({ name, signatures, detail });
      console.log(`ok ${name}: ${detail} [${signatures.join(",")}]`);
    };

    // Preserve other wallets' collateral while exercising the two local identities.
    const escrowBefore = await fetchTokenBalanceStrict(
      client,
      "escrow",
      escrow,
    );
    const supplyBefore = await fetchMintSupply(client, wrappedMint);
    const unwrappedABefore = await fetchTokenBalanceStrict(
      client,
      "ata-a",
      ataA,
    );
    const unwrappedBBefore = await fetchTokenBalanceStrict(
      client,
      "ata-b",
      ataB,
    );
    if (unwrappedABefore < FUND_AMOUNT_A)
      throw new Error(
        `${asset.symbol} fixture A balance is below ${FUND_AMOUNT_A}; rerun setup`,
      );

    // Confidential token accounts for A and B on the wrapped mint.
    const keysA = await deriveKeys(userA, userA.address, wrappedMint);
    const keysB = await deriveKeys(userB, userB.address, wrappedMint);
    const [wrappedAtaA] = await findToken2022Ata({
      owner: userA.address,
      mint: wrappedMint,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    });
    const [wrappedAtaB] = await findToken2022Ata({
      owner: userB.address,
      mint: wrappedMint,
      tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
    });
    for (const [owner, wrappedAta, keys] of [
      [userA, wrappedAtaA, keysA],
      [userB, wrappedAtaB, keysB],
    ] as const) {
      const existing = await fetchEncodedAccount(client.rpc, wrappedAta);
      let configured = false;
      if (existing.exists) {
        const decoded = await fetchToken2022Token(client.rpc, wrappedAta);
        configured = hasConfidentialExtension(decoded.data);
      }
      if (!configured) {
        const plan = await getCreateConfidentialTransferAccountInstructionPlan({
          rpc: client.rpc,
          payer,
          owner,
          mint: wrappedMint,
          token: wrappedAta,
          elgamalKeypair: keys.elgamalKeypair,
          aesKey: keys.aesKey,
        });
        const signatures = await sendPlan(client, plan);
        record(
          `configure-${owner.address === userA.address ? "a" : "b"}`,
          signatures,
          `confidential account ${wrappedAta}`,
        );
      }
    }

    // Wrap 100 units: A unwrapped -> escrow, 100 public wrapped to A.
    const wrappedMintAuthority = await findWrappedMintAuthorityPda(
      WRAPPER_PROGRAM_ADDRESS,
      wrappedMint,
    );
    const wrapSig = await sendInstructions(client, payer, [
      getWrapInstruction(
        WRAPPER_PROGRAM_ADDRESS,
        {
          recipientWrappedTokenAccount: wrappedAtaA,
          wrappedMint,
          wrappedMintAuthority,
          unwrappedTokenProgram: underlyingProgram,
          wrappedTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
          unwrappedTokenAccount: ataA,
          unwrappedMint,
          unwrappedEscrow: escrow,
          transferAuthority: userA,
        },
        FUND_AMOUNT_A,
      ),
    ]);
    record("wrap-a-100", [wrapSig], `A wrapped 100 ${asset.symbol}`);

    // Confidential deposit 100 + apply pending for A.
    const depositSig = await sendInstructions(client, payer, [
      getConfidentialDepositInstruction({
        token: wrappedAtaA,
        mint: wrappedMint,
        authority: userA,
        amount: FUND_AMOUNT_A,
        decimals: asset.decimals,
      }),
    ]);
    record("deposit-a-100", [depositSig], "A deposited 100 to pending");
    const tokenABefore = (await fetchToken2022Token(client.rpc, wrappedAtaA))
      .data;
    const applyASig = await sendInstructions(client, payer, [
      getApplyConfidentialPendingBalanceInstructionFromToken({
        token: wrappedAtaA,
        tokenAccount: tokenABefore,
        authority: userA,
        elgamalSecretKey: keysA.elgamalSecretKey,
        aesKey: keysA.aesKey,
      }),
    ]);
    record("apply-a", [applyASig], "A applied pending balance");
    const balanceA1 = await fetchConfidentialTransferBalance({
      token: wrappedAtaA,
      rpc: client.rpc,
      elgamalSecretKey: keysA.elgamalSecretKey,
      aesKey: keysA.aesKey,
    });
    if (balanceA1.availableBalance !== FUND_AMOUNT_A) {
      throw new Error(
        `A available mismatch after deposit: ${balanceA1.availableBalance}`,
      );
    }

    // Confidential transfer 30 from A to B (native ZK proofs, no mocks).
    const sourceAccount = (await fetchToken2022Token(client.rpc, wrappedAtaA))
      .data;
    const destinationAccount = (
      await fetchToken2022Token(client.rpc, wrappedAtaB)
    ).data;
    const transferPlan = await getConfidentialTransferInstructionPlan({
      rpc: client.rpc,
      payer,
      authority: userA,
      mint: wrappedMint,
      sourceToken: wrappedAtaA,
      sourceTokenAccount: sourceAccount,
      destinationToken: wrappedAtaB,
      destinationTokenAccount: destinationAccount,
      amount: TRANSFER_AMOUNT_B,
      sourceElgamalKeypair: keysA.elgamalKeypair,
      aesKey: keysA.aesKey,
    });
    const transferSigs = await sendPlan(client, transferPlan);
    record("transfer-a-to-b-30", transferSigs, "A sent 30 confidentially to B");

    // B applies pending, then checks out 30: withdraw + unwrap.
    const tokenBAfter = (await fetchToken2022Token(client.rpc, wrappedAtaB))
      .data;
    const applyBSig = await sendInstructions(client, payer, [
      getApplyConfidentialPendingBalanceInstructionFromToken({
        token: wrappedAtaB,
        tokenAccount: tokenBAfter,
        authority: userB,
        elgamalSecretKey: keysB.elgamalSecretKey,
        aesKey: keysB.aesKey,
      }),
    ]);
    record("apply-b", [applyBSig], "B applied pending balance");
    const balanceB1 = await fetchConfidentialTransferBalance({
      token: wrappedAtaB,
      rpc: client.rpc,
      elgamalSecretKey: keysB.elgamalSecretKey,
      aesKey: keysB.aesKey,
    });
    if (balanceB1.availableBalance !== TRANSFER_AMOUNT_B) {
      throw new Error(
        `B available mismatch after transfer: ${balanceB1.availableBalance}`,
      );
    }
    const balanceA2 = await fetchConfidentialTransferBalance({
      token: wrappedAtaA,
      rpc: client.rpc,
      elgamalSecretKey: keysA.elgamalSecretKey,
      aesKey: keysA.aesKey,
    });
    if (balanceA2.availableBalance !== REDEEM_AMOUNT_A) {
      throw new Error(
        `A available mismatch after transfer: ${balanceA2.availableBalance}`,
      );
    }

    const tokenBWithdraw = (await fetchToken2022Token(client.rpc, wrappedAtaB))
      .data;
    const withdrawPlanB = await getConfidentialWithdrawInstructionPlan({
      rpc: client.rpc,
      payer,
      token: wrappedAtaB,
      mint: wrappedMint,
      tokenAccount: tokenBWithdraw,
      authority: userB,
      amount: TRANSFER_AMOUNT_B,
      decimals: asset.decimals,
      elgamalKeypair: keysB.elgamalKeypair,
      aesKey: keysB.aesKey,
    });
    const withdrawSigsB = await sendPlan(client, withdrawPlanB);
    record("withdraw-b-30", withdrawSigsB, "B withdrew 30 to public balance");
    const unwrapBSig = await sendInstructions(client, payer, [
      getUnwrapInstruction(
        WRAPPER_PROGRAM_ADDRESS,
        {
          unwrappedEscrow: escrow,
          recipientUnwrappedToken: ataB,
          wrappedMintAuthority,
          unwrappedMint,
          wrappedTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
          unwrappedTokenProgram: underlyingProgram,
          wrappedTokenAccount: wrappedAtaB,
          wrappedMint,
          transferAuthority: userB,
        },
        TRANSFER_AMOUNT_B,
      ),
    ]);
    record("unwrap-b-30", [unwrapBSig], `B unwrapped 30 to ${asset.symbol}`);

    // A redeems the remaining 70: withdraw + unwrap.
    const tokenAWithdraw = (await fetchToken2022Token(client.rpc, wrappedAtaA))
      .data;
    const withdrawPlanA = await getConfidentialWithdrawInstructionPlan({
      rpc: client.rpc,
      payer,
      token: wrappedAtaA,
      mint: wrappedMint,
      tokenAccount: tokenAWithdraw,
      authority: userA,
      amount: REDEEM_AMOUNT_A,
      decimals: asset.decimals,
      elgamalKeypair: keysA.elgamalKeypair,
      aesKey: keysA.aesKey,
    });
    const withdrawSigsA = await sendPlan(client, withdrawPlanA);
    record("withdraw-a-70", withdrawSigsA, "A withdrew 70 to public balance");
    const unwrapASig = await sendInstructions(client, payer, [
      getUnwrapInstruction(
        WRAPPER_PROGRAM_ADDRESS,
        {
          unwrappedEscrow: escrow,
          recipientUnwrappedToken: ataA,
          wrappedMintAuthority,
          unwrappedMint,
          wrappedTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
          unwrappedTokenProgram: underlyingProgram,
          wrappedTokenAccount: wrappedAtaA,
          wrappedMint,
          transferAuthority: userA,
        },
        REDEEM_AMOUNT_A,
      ),
    ]);
    record("unwrap-a-70", [unwrapASig], `A unwrapped 70 to ${asset.symbol}`);

    // The round trip must restore collateral and supply to their starting values.
    const escrowAfter = await fetchTokenBalanceStrict(client, "escrow", escrow);
    const supplyAfter = await fetchMintSupply(client, wrappedMint);
    const unwrappedAAfter = await fetchTokenBalanceStrict(
      client,
      "ata-a",
      ataA,
    );
    const unwrappedBAfter = await fetchTokenBalanceStrict(
      client,
      "ata-b",
      ataB,
    );
    const assertions = [
      {
        name: "escrow-restored",
        expected: escrowBefore.toString(),
        actual: escrowAfter.toString(),
      },
      {
        name: "supply-restored",
        expected: supplyBefore.toString(),
        actual: supplyAfter.toString(),
      },
      {
        name: "a-unwrapped-70",
        expected: (unwrappedABefore - TRANSFER_AMOUNT_B).toString(),
        actual: unwrappedAAfter.toString(),
      },
      {
        name: "b-unwrapped-30",
        expected: (unwrappedBBefore + TRANSFER_AMOUNT_B).toString(),
        actual: unwrappedBAfter.toString(),
      },
    ];
    allSteps.push(
      ...steps.map((step) => ({
        ...step,
        name: `${asset.symbol}:${step.name}`,
      })),
    );
    allAssertions.push(
      ...assertions.map((assertion) => ({
        ...assertion,
        name: `${asset.symbol}:${assertion.name}`,
      })),
    );
  }
  const failed = allAssertions.filter(
    (a) =>
      (a as { expected: string; actual: string }).expected !==
      (a as { expected: string; actual: string }).actual,
  );
  const slot = await client.rpc.getSlot().send();
  const result = {
    outcome: failed.length === 0 ? "pass" : "fail",
    startedAt,
    completedAt: new Date().toISOString(),
    slot: slot.toString(),
    wrapperProgram: WRAPPER_PROGRAM_ADDRESS.toString(),
    steps: allSteps,
    assertions: allAssertions,
  };
  writeFileSync(RESULTS_JSON_PATH, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`Wrote ${RESULTS_JSON_PATH}: ${result.outcome}`);
  if (failed.length > 0)
    throw new Error(`Assertions failed: ${JSON.stringify(failed)}`);
}

main().catch((error) => {
  console.error(
    `roundtrip failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
