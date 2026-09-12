import {
  type Address,
  address,
  fetchEncodedAccount,
  getBase58Encoder,
  isAddress,
} from "@solana/kit";
import {
  findAssociatedTokenPda as findLegacyAta,
  getCreateAssociatedTokenIdempotentInstruction as getLegacyCreateAta,
  getTokenDecoder as getLegacyTokenDecoder,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  fetchMaybeToken,
  findAssociatedTokenPda,
  getConfidentialDepositInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
  type Token,
} from "@solana-program/token-2022";
import {
  decryptConfidentialTransferBalance,
  fetchConfidentialTransferBalance,
  getApplyConfidentialPendingBalanceInstructionFromToken,
  getConfidentialTransferInstructionPlan,
  getConfidentialWithdrawInstructionPlan,
  getCreateConfidentialTransferAccountInstructionPlan,
} from "@solana-program/token-2022/confidential";
import type { LocalManifest } from "@/lib/manifest";
import {
  deriveKeys,
  type Session,
  type SessionKeys,
  sendPlan,
  sendSingle,
} from "@/lib/session";
import {
  findWrappedMintAuthorityPda,
  getUnwrapInstruction,
  getWrapInstruction,
} from "@/lib/wrap";

export type TxStage =
  | "idle"
  | "preparing-account"
  | "preparing-proof"
  | "awaiting-approval"
  | "submitted"
  | "confirmed";

export interface BalanceView {
  public: bigint | null;
  pending: bigint | null;
  confidential: bigint | null;
}

export type Progress = (
  stage: TxStage,
  message: string,
  signature?: string,
) => void;

export class RecipientNotReadyError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "RecipientNotReadyError";
  }
}

interface ConfidentialExtension {
  approved: boolean;
  elgamalPubkey: Address;
  allowConfidentialCredits: boolean;
}

function confidentialExtension(
  token: Token,
): ConfidentialExtension | undefined {
  if (token.extensions.__option !== "Some") {
    return undefined;
  }
  for (const extension of token.extensions.value) {
    if (extension.__kind === "ConfidentialTransferAccount") {
      return extension;
    }
  }
  return undefined;
}

function addresses(manifest: LocalManifest) {
  return {
    wrapperProgram: manifest.wrapperProgram,
    unwrappedMint: manifest.testUsd.mint,
    wrappedMint: manifest.wrapped.mint,
    escrow: manifest.wrapped.escrow,
  };
}

export async function unlockSession(session: Session): Promise<SessionKeys> {
  const { wrappedMint } = addresses(session.manifest);
  const keys = await deriveKeys(session.signer, session.owner, wrappedMint);
  const [ata] = await findAssociatedTokenPda({
    owner: session.owner,
    mint: wrappedMint,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });
  const account = await fetchMaybeToken(session.client.rpc, ata);
  if (account.exists) {
    const extension = confidentialExtension(account.data);
    if (extension) {
      const expected = new Uint8Array(keys.elgamalKeypair.pubkey().toBytes());
      const actual = getBase58Encoder().encode(extension.elgamalPubkey);
      if (
        expected.length !== actual.length ||
        !expected.every((byte, index) => byte === actual[index])
      ) {
        throw new Error("Wallet keys do not match this confidential account.");
      }
    }
  }
  session.keys = keys;
  return keys;
}

function requireKeys(session: Session): SessionKeys {
  if (!session.keys) {
    throw new Error("Confidential keys are locked");
  }
  return session.keys;
}

export async function readBalances(session: Session): Promise<BalanceView> {
  const { wrappedMint } = addresses(session.manifest);
  const [ata] = await findAssociatedTokenPda({
    owner: session.owner,
    mint: wrappedMint,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });
  const account = await fetchMaybeToken(session.client.rpc, ata);
  if (!account.exists) {
    return { public: null, pending: null, confidential: null };
  }
  const view: BalanceView = {
    public: account.data.amount,
    pending: null,
    confidential: null,
  };
  if (!session.keys) {
    return view;
  }
  const extension = confidentialExtension(account.data);
  if (!extension) {
    return view;
  }
  const decrypted = decryptConfidentialTransferBalance({
    tokenAccount: account.data,
    elgamalSecretKey: session.keys.elgamalSecretKey,
    aesKey: session.keys.aesKey,
  });
  view.pending = decrypted.pendingBalance;
  view.confidential = decrypted.availableBalance;
  return view;
}

export async function readUnwrappedBalance(
  session: Session,
): Promise<bigint | null> {
  const { unwrappedMint } = addresses(session.manifest);
  const [ata] = await findLegacyAta({
    owner: session.owner,
    mint: unwrappedMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const account = await fetchEncodedAccount(session.client.rpc, ata);
  if (!account.exists) {
    return null;
  }
  return getLegacyTokenDecoder().decode(account.data).amount;
}

export async function ensureConfidentialAccount(
  session: Session,
  onProgress: Progress,
): Promise<{ address: Address; created: boolean }> {
  const { wrappedMint } = addresses(session.manifest);
  const keys = session.keys ?? (await unlockSession(session));
  const [ata] = await findAssociatedTokenPda({
    owner: session.owner,
    mint: wrappedMint,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });
  const account = await fetchMaybeToken(session.client.rpc, ata);
  if (account.exists && confidentialExtension(account.data)) {
    return { address: ata, created: false };
  }
  onProgress("preparing-account", "Preparing confidential account");
  const plan = await getCreateConfidentialTransferAccountInstructionPlan({
    rpc: session.client.rpc,
    payer: session.signer,
    owner: session.signer,
    mint: wrappedMint,
    token: ata,
    elgamalKeypair: keys.elgamalKeypair,
    aesKey: keys.aesKey,
  });
  onProgress("awaiting-approval", "Approve the account transaction");
  const signatures = await sendPlan(session, plan);
  onProgress("confirmed", "Account ready", signatures.at(-1));
  return { address: ata, created: true };
}

async function applyPending(
  session: Session,
  token: Address,
  account: Token,
  onProgress: Progress,
): Promise<string> {
  const keys = requireKeys(session);
  const signature = await sendSingle(session, [
    getApplyConfidentialPendingBalanceInstructionFromToken({
      token,
      tokenAccount: account,
      authority: session.signer,
      elgamalSecretKey: keys.elgamalSecretKey,
      aesKey: keys.aesKey,
    }),
  ]);
  onProgress("confirmed", "Applied pending balance", signature);
  return signature;
}

export async function applyPendingBalance(
  session: Session,
  onProgress: Progress,
): Promise<string | null> {
  const keys = requireKeys(session);
  const { address: token } = await ensureConfidentialAccount(
    session,
    onProgress,
  );
  const live = await fetchConfidentialTransferBalance({
    token,
    rpc: session.client.rpc,
    elgamalSecretKey: keys.elgamalSecretKey,
    aesKey: keys.aesKey,
  });
  if (live.pendingBalance === 0n) {
    return null;
  }
  const account = await fetchMaybeToken(session.client.rpc, token);
  if (!account.exists) {
    throw new Error("Token account missing before applying pending");
  }
  return applyPending(session, token, account.data, onProgress);
}

export async function convert(
  session: Session,
  amount: bigint,
  onProgress: Progress,
): Promise<string[]> {
  const { wrapperProgram, unwrappedMint, wrappedMint, escrow } = addresses(
    session.manifest,
  );
  const signatures: string[] = [];
  const { address: wrappedAta } = await ensureConfidentialAccount(
    session,
    onProgress,
  );
  const [unwrappedAta] = await findLegacyAta({
    owner: session.owner,
    mint: unwrappedMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  onProgress("awaiting-approval", "Approve the wrap transaction");
  signatures.push(
    await sendSingle(session, [
      getLegacyCreateAta({
        payer: session.signer,
        ata: unwrappedAta,
        owner: session.owner,
        mint: unwrappedMint,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      }),
      getWrapInstruction(
        wrapperProgram,
        {
          recipientWrappedTokenAccount: wrappedAta,
          wrappedMint,
          wrappedMintAuthority: await findWrappedMintAuthorityPda(
            wrapperProgram,
            wrappedMint,
          ),
          unwrappedTokenProgram: TOKEN_PROGRAM_ADDRESS,
          wrappedTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
          unwrappedTokenAccount: unwrappedAta,
          unwrappedMint,
          unwrappedEscrow: escrow,
          transferAuthority: session.signer,
        },
        amount,
      ),
      getConfidentialDepositInstruction({
        token: wrappedAta,
        mint: wrappedMint,
        authority: session.signer,
        amount,
        decimals: session.manifest.testUsd.decimals,
      }),
    ]),
  );
  const deposited = await fetchMaybeToken(session.client.rpc, wrappedAta);
  if (!deposited.exists) {
    throw new Error("Wrapped account missing after deposit");
  }
  signatures.push(
    await applyPending(session, wrappedAta, deposited.data, onProgress),
  );
  return signatures;
}

export async function checkRecipient(
  session: Session,
  recipient: string,
): Promise<Address> {
  const trimmed = recipient.trim();
  if (!isAddress(trimmed)) {
    throw new RecipientNotReadyError("Recipient address is not valid");
  }
  const { wrappedMint } = addresses(session.manifest);
  const [ata] = await findAssociatedTokenPda({
    owner: address(trimmed),
    mint: wrappedMint,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });
  const account = await fetchMaybeToken(session.client.rpc, ata);
  if (!account.exists) {
    throw new RecipientNotReadyError(
      "Recipient has no Wrapped Test USD account yet",
    );
  }
  const extension = confidentialExtension(account.data);
  if (!extension) {
    throw new RecipientNotReadyError(
      "Recipient has not prepared a confidential account",
    );
  }
  if (!extension.approved || !extension.allowConfidentialCredits) {
    throw new RecipientNotReadyError(
      "Recipient account is not approved for confidential transfers",
    );
  }
  return ata;
}

export async function send(
  session: Session,
  recipient: string,
  amount: bigint,
  onProgress: Progress,
): Promise<string[]> {
  const { wrappedMint } = addresses(session.manifest);
  const signatures: string[] = [];
  const { address: source } = await ensureConfidentialAccount(
    session,
    onProgress,
  );
  const destination = await checkRecipient(session, recipient);
  const keys = requireKeys(session);
  const live = await fetchConfidentialTransferBalance({
    token: source,
    rpc: session.client.rpc,
    elgamalSecretKey: keys.elgamalSecretKey,
    aesKey: keys.aesKey,
  });
  if (live.pendingBalance > 0n) {
    onProgress("awaiting-approval", "Applying your pending balance first");
    const account = await fetchMaybeToken(session.client.rpc, source);
    if (account.exists) {
      signatures.push(
        await applyPending(session, source, account.data, onProgress),
      );
    }
  }
  const sourceAccount = await fetchMaybeToken(session.client.rpc, source);
  const destinationAccount = await fetchMaybeToken(
    session.client.rpc,
    destination,
  );
  if (!sourceAccount.exists || !destinationAccount.exists) {
    throw new Error("Token account missing before transfer");
  }
  onProgress("preparing-proof", "Generating transfer proofs");
  const plan = await getConfidentialTransferInstructionPlan({
    rpc: session.client.rpc,
    payer: session.signer,
    authority: session.signer,
    mint: wrappedMint,
    sourceToken: source,
    sourceTokenAccount: sourceAccount.data,
    destinationToken: destination,
    destinationTokenAccount: destinationAccount.data,
    amount,
    sourceElgamalKeypair: keys.elgamalKeypair,
    aesKey: keys.aesKey,
  });
  onProgress("awaiting-approval", "Approve the transfer transactions");
  signatures.push(...(await sendPlan(session, plan)));
  onProgress("confirmed", "Transfer confirmed", signatures.at(-1));
  return signatures;
}

export async function withdraw(
  session: Session,
  amount: bigint,
  onProgress: Progress,
): Promise<{ signatures: string[]; unwrapped: bigint }> {
  const { wrapperProgram, unwrappedMint, wrappedMint, escrow } = addresses(
    session.manifest,
  );
  const signatures: string[] = [];
  const { address: token } = await ensureConfidentialAccount(
    session,
    onProgress,
  );
  let account = await fetchMaybeToken(session.client.rpc, token);
  if (!account.exists) {
    throw new Error("Token account missing before withdrawal");
  }
  let publicBalance = account.data.amount;
  if (publicBalance < amount) {
    const keys = requireKeys(session);
    const live = await fetchConfidentialTransferBalance({
      token,
      rpc: session.client.rpc,
      elgamalSecretKey: keys.elgamalSecretKey,
      aesKey: keys.aesKey,
    });
    if (live.pendingBalance > 0n) {
      onProgress("awaiting-approval", "Applying your pending balance first");
      signatures.push(
        await applyPending(session, token, account.data, onProgress),
      );
      account = await fetchMaybeToken(session.client.rpc, token);
      if (!account.exists) {
        throw new Error("Token account missing after applying pending");
      }
      publicBalance = account.data.amount;
    }
    if (publicBalance < amount) {
      const needed = amount - publicBalance;
      onProgress("preparing-proof", "Moving to public balance");
      const plan = await getConfidentialWithdrawInstructionPlan({
        rpc: session.client.rpc,
        payer: session.signer,
        token,
        mint: wrappedMint,
        tokenAccount: account.data,
        authority: session.signer,
        amount: needed,
        decimals: session.manifest.testUsd.decimals,
        elgamalKeypair: keys.elgamalKeypair,
        aesKey: keys.aesKey,
      });
      onProgress("awaiting-approval", "Approve the withdrawal transactions");
      signatures.push(...(await sendPlan(session, plan)));
    }
  }
  const [unwrappedAta] = await findLegacyAta({
    owner: session.owner,
    mint: unwrappedMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  onProgress("awaiting-approval", "Approve the unwrap transaction");
  signatures.push(
    await sendSingle(session, [
      getLegacyCreateAta({
        payer: session.signer,
        ata: unwrappedAta,
        owner: session.owner,
        mint: unwrappedMint,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      }),
      getUnwrapInstruction(
        wrapperProgram,
        {
          unwrappedEscrow: escrow,
          recipientUnwrappedToken: unwrappedAta,
          wrappedMintAuthority: await findWrappedMintAuthorityPda(
            wrapperProgram,
            wrappedMint,
          ),
          unwrappedMint,
          wrappedTokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
          unwrappedTokenProgram: TOKEN_PROGRAM_ADDRESS,
          wrappedTokenAccount: token,
          wrappedMint,
          transferAuthority: session.signer,
        },
        amount,
      ),
    ]),
  );
  onProgress("confirmed", "Withdrawn to Test USD", signatures.at(-1));
  return { signatures, unwrapped: amount };
}

export async function requestFunds(target: string): Promise<{
  funded: string;
  testUsdAccount: string;
  signatures: string[];
}> {
  const response = await fetch("/api/local-fund", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: target }),
  });
  if (response.status === 404) {
    throw new Error("Test funding needs the local dev server");
  }
  const body = (await response.json()) as {
    funded?: string;
    testUsdAccount?: string;
    signatures?: string[];
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? "Test funding failed");
  }
  return {
    funded: body.funded ?? target,
    testUsdAccount: body.testUsdAccount ?? "",
    signatures: body.signatures ?? [],
  };
}
