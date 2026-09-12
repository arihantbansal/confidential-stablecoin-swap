import {
  findWrappedMintAuthorityPda,
  getUnwrapInstruction,
  getWrapInstruction,
} from "@confidential-stablecoin/runtime/wrap";
import {
  type Address,
  address,
  fetchEncodedAccount,
  getBase58Encoder,
  type Instruction,
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
  findAssociatedTokenPda as findToken2022Ata,
  getConfidentialDepositInstruction,
  getCreateAssociatedTokenIdempotentInstruction as getToken2022CreateAta,
  getTokenDecoder as getToken2022Decoder,
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
import { failureError } from "@/lib/failures";
import {
  deriveKeys,
  disposeKeys,
  releaseSessionKeys,
  retainSessionKeys,
  type Session,
  type SessionKeys,
  sendPlan,
  sendSingle,
} from "@/lib/session";

export type TxStage =
  | "preparing-account"
  | "preparing-proof"
  | "awaiting-approval"
  | "confirmed";

export interface BalanceView {
  public: bigint | null;
  pending: bigint | null;
  confidential: bigint | null;
  hasPending?: boolean;
}

export type Progress = (
  stage: TxStage,
  message: string,
  signature?: string,
) => void;

interface ConfidentialExtension {
  approved: boolean;
  elgamalPubkey: Address;
  allowConfidentialCredits: boolean;
  pendingBalanceCreditCounter: bigint;
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

function addresses(session: Session) {
  const asset = session.selectedAsset;
  return {
    wrapperProgram: session.manifest.wrapperProgram,
    asset,
    unwrappedMint: asset.mint,
    wrappedMint: asset.wrapped.mint,
    escrow: asset.wrapped.escrow,
  };
}

function findUnderlyingAta(session: Session) {
  const { asset } = addresses(session);
  return asset.tokenProgram === TOKEN_2022_PROGRAM_ADDRESS
    ? findToken2022Ata({
        owner: session.owner,
        mint: asset.mint,
        tokenProgram: asset.tokenProgram,
      })
    : findLegacyAta({
        owner: session.owner,
        mint: asset.mint,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
}

function createUnderlyingAta(session: Session, ata: Address) {
  const { asset } = addresses(session);
  return asset.tokenProgram === TOKEN_2022_PROGRAM_ADDRESS
    ? getToken2022CreateAta({
        payer: session.signer,
        owner: session.owner,
        mint: asset.mint,
        ata,
      })
    : getLegacyCreateAta({
        payer: session.signer,
        owner: session.owner,
        mint: asset.mint,
        ata,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      });
}

export async function unlockSession(session: Session): Promise<SessionKeys> {
  if (session.keys && !session.disposed) {
    return session.keys;
  }
  if (session.disposed) {
    throw new Error("Wallet session is disconnected");
  }
  if (session.unlockingKeys) {
    return session.unlockingKeys;
  }
  const { wrappedMint } = addresses(session);
  const unlocking = (async () => {
    const keys = await deriveKeys(session.signer, session.owner, wrappedMint);
    try {
      const [ata] = await findAssociatedTokenPda({
        owner: session.owner,
        mint: wrappedMint,
        tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
      });
      const account = await fetchMaybeToken(session.client.rpc, ata);
      if (account.exists) {
        const extension = confidentialExtension(account.data);
        if (extension) {
          const pubkey = keys.elgamalKeypair.pubkey();
          const expected = new Uint8Array(pubkey.toBytes());
          pubkey.free();
          const actual = getBase58Encoder().encode(extension.elgamalPubkey);
          if (
            expected.length !== actual.length ||
            !expected.every((byte, index) => byte === actual[index])
          ) {
            throw new Error(
              "Wallet keys do not match this confidential account.",
            );
          }
        }
      }
      if (session.disposed) {
        throw new Error("Wallet session is disconnected");
      }
      session.keys = keys;
      return keys;
    } catch (error) {
      disposeKeys(keys);
      throw error;
    }
  })();
  session.unlockingKeys = unlocking;
  try {
    return await unlocking;
  } finally {
    if (session.unlockingKeys === unlocking) {
      session.unlockingKeys = null;
    }
  }
}

function requireKeys(session: Session): SessionKeys {
  if (!session.keys || session.disposed) {
    throw new Error("Confidential keys are locked");
  }
  return session.keys;
}

export async function readBalances(session: Session): Promise<BalanceView> {
  const { wrappedMint } = addresses(session);
  const [ata] = await findAssociatedTokenPda({
    owner: session.owner,
    mint: wrappedMint,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });
  const account = await fetchMaybeToken(session.client.rpc, ata);
  if (!account.exists) {
    return { public: 0n, pending: 0n, confidential: 0n };
  }
  const view: BalanceView = {
    public: account.data.amount,
    pending: null,
    confidential: null,
  };
  const extension = confidentialExtension(account.data);
  view.hasPending = (extension?.pendingBalanceCreditCounter ?? 0n) > 0n;
  const keys = retainSessionKeys(session);
  if (!keys) {
    return view;
  }
  try {
    const extension = confidentialExtension(account.data);
    if (!extension) {
      return { ...view, pending: 0n, confidential: 0n };
    }
    const decrypted = decryptConfidentialTransferBalance({
      tokenAccount: account.data,
      elgamalSecretKey: keys.elgamalSecretKey,
      aesKey: keys.aesKey,
    });
    view.pending = decrypted.pendingBalance;
    view.confidential = decrypted.availableBalance;
    return view;
  } finally {
    releaseSessionKeys(session);
  }
}

export async function readUnwrappedBalance(
  session: Session,
): Promise<bigint | null> {
  const [ata] = await findUnderlyingAta(session);
  const account = await fetchEncodedAccount(session.client.rpc, ata);
  if (!account.exists) {
    return 0n;
  }
  return session.selectedAsset.tokenProgram === TOKEN_2022_PROGRAM_ADDRESS
    ? getToken2022Decoder().decode(account.data).amount
    : getLegacyTokenDecoder().decode(account.data).amount;
}

export async function ensureConfidentialAccount(
  session: Session,
  onProgress: Progress,
): Promise<{ address: Address; created: boolean }> {
  const { wrappedMint } = addresses(session);
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
  const signatures = await sendSteps(session, plan, onProgress);
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
  const signature = await sendStep(session, onProgress, [
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
  return withSessionOperation(session, onProgress, async (report) => {
    const keys = requireKeys(session);
    const { address: token } = await ensureConfidentialAccount(session, report);
    const account = await fetchMaybeToken(session.client.rpc, token);
    if (!account.exists)
      throw new Error("Token account missing before applying pending");
    const live = decryptConfidentialTransferBalance({
      tokenAccount: account.data,
      elgamalSecretKey: keys.elgamalSecretKey,
      aesKey: keys.aesKey,
    });
    if (live.pendingBalance === 0n) return null;
    return applyPending(session, token, account.data, report);
  });
}

async function convertTokens(
  session: Session,
  amount: bigint,
  onProgress: Progress,
): Promise<string[]> {
  const { wrapperProgram, unwrappedMint, wrappedMint, escrow, asset } =
    addresses(session);
  const signatures: string[] = [];
  const { address: wrappedAta } = await ensureConfidentialAccount(
    session,
    onProgress,
  );
  const [unwrappedAta] = await findUnderlyingAta(session);
  onProgress("awaiting-approval", "Approve the wrap transaction");
  signatures.push(
    await sendStep(session, onProgress, [
      createUnderlyingAta(session, unwrappedAta),
      getWrapInstruction(
        wrapperProgram,
        {
          recipientWrappedTokenAccount: wrappedAta,
          wrappedMint,
          wrappedMintAuthority: await findWrappedMintAuthorityPda(
            wrapperProgram,
            wrappedMint,
          ),
          unwrappedTokenProgram: asset.tokenProgram,
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
        decimals: asset.decimals,
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
    throw new Error("Recipient address is not valid");
  }
  const { wrappedMint } = addresses(session);
  const [ata] = await findAssociatedTokenPda({
    owner: address(trimmed),
    mint: wrappedMint,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });
  const account = await fetchMaybeToken(session.client.rpc, ata);
  if (!account.exists) {
    throw new Error(
      `Recipient has no ${session.selectedAsset.symbol} confidential account yet`,
    );
  }
  const extension = confidentialExtension(account.data);
  if (!extension) {
    throw new Error("Recipient has not prepared a confidential account");
  }
  if (!extension.approved || !extension.allowConfidentialCredits) {
    throw new Error(
      "Recipient account is not approved for confidential transfers",
    );
  }
  return ata;
}

async function sendTokens(
  session: Session,
  recipient: string,
  amount: bigint,
  onProgress: Progress,
): Promise<string[]> {
  const { wrappedMint } = addresses(session);
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
  const [sourceAccount, destinationAccount] = await Promise.all([
    fetchMaybeToken(session.client.rpc, source),
    fetchMaybeToken(session.client.rpc, destination),
  ]);
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
  signatures.push(...(await sendSteps(session, plan, onProgress)));
  onProgress("confirmed", "Transfer confirmed", signatures.at(-1));
  return signatures;
}

async function withdrawTokens(
  session: Session,
  amount: bigint,
  onProgress: Progress,
): Promise<{ signatures: string[]; unwrapped: bigint }> {
  const { wrapperProgram, unwrappedMint, wrappedMint, escrow, asset } =
    addresses(session);
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
        decimals: asset.decimals,
        elgamalKeypair: keys.elgamalKeypair,
        aesKey: keys.aesKey,
      });
      onProgress("awaiting-approval", "Approve the withdrawal transactions");
      signatures.push(...(await sendSteps(session, plan, onProgress)));
    }
  }
  const [unwrappedAta] = await findUnderlyingAta(session);
  onProgress("awaiting-approval", "Approve the unwrap transaction");
  signatures.push(
    await sendStep(session, onProgress, [
      createUnderlyingAta(session, unwrappedAta),
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
          unwrappedTokenProgram: asset.tokenProgram,
          wrappedTokenAccount: token,
          wrappedMint,
          transferAuthority: session.signer,
        },
        amount,
      ),
    ]),
  );
  onProgress(
    "confirmed",
    `Withdrawn to ${session.selectedAsset.symbol}`,
    signatures.at(-1),
  );
  return { signatures, unwrapped: amount };
}

export async function requestFunds(
  target: string,
  symbol: string,
): Promise<{ tokensAdded: boolean; solAdded: boolean }> {
  const response = await fetch("/api/local-fund", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: target, symbol }),
    signal: AbortSignal.timeout(45000),
  });
  if (response.status === 404) {
    throw new Error("Local funding needs the dev server");
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      signature?: string;
    } | null;
    if (body?.signature) {
      throw failureError({
        cause: body.error ?? "Local funding failed",
        confirmedSignatures: [],
        failedSignatures: [],
        unresolvedSignatures: [body.signature],
      });
    }
    throw new Error(body?.error ?? "Local funding failed");
  }
  return (await response.json()) as {
    tokensAdded: boolean;
    solAdded: boolean;
  };
}

async function sendStep(
  session: Session,
  onProgress: Progress,
  instructions: readonly Instruction[],
): Promise<string> {
  if (session.disposed) throw new Error("Wallet session is disconnected");
  const signature = await sendSingle(session, instructions);
  onProgress("confirmed", "Transaction confirmed", signature);
  return signature;
}

async function sendSteps(
  session: Session,
  plan: Parameters<typeof sendPlan>[1],
  onProgress: Progress,
): Promise<string[]> {
  if (session.disposed) throw new Error("Wallet session is disconnected");
  const signatures = await sendPlan(session, plan);
  for (const signature of signatures)
    onProgress("confirmed", "Transaction confirmed", signature);
  return signatures;
}

async function withSessionOperation<T>(
  session: Session,
  onProgress: Progress,
  operation: (report: Progress) => Promise<T>,
): Promise<T> {
  await unlockSession(session);
  if (!retainSessionKeys(session))
    throw new Error("Wallet session is disconnected");
  const confirmed = new Set<string>();
  try {
    return await operation((stage, message, signature) => {
      if (signature) confirmed.add(signature);
      onProgress(stage, message, signature);
    });
  } catch (error) {
    throw failureError(error, confirmed);
  } finally {
    releaseSessionKeys(session);
  }
}

export function convert(
  session: Session,
  amount: bigint,
  onProgress: Progress,
): Promise<string[]> {
  return withSessionOperation(session, onProgress, (report) =>
    convertTokens(session, amount, report),
  );
}
export function send(
  session: Session,
  recipient: string,
  amount: bigint,
  onProgress: Progress,
): Promise<string[]> {
  return withSessionOperation(session, onProgress, (report) =>
    sendTokens(session, recipient, amount, report),
  );
}
export function withdraw(
  session: Session,
  amount: bigint,
  onProgress: Progress,
): Promise<{ signatures: string[]; unwrapped: bigint }> {
  return withSessionOperation(session, onProgress, (report) =>
    withdrawTokens(session, amount, report),
  );
}
