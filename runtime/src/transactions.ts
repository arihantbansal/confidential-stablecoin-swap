/**
 * Browser-safe transaction sending shared by the runtime scripts and the web
 * app. This module must not import Node builtins or runtime configuration so
 * the web bundle can use it directly.
 */

import {
  type Address,
  appendTransactionMessageInstructions,
  assertIsSendableTransaction,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  type GetEpochInfoApi,
  type GetLatestBlockhashApi,
  type GetSignatureStatusesApi,
  getSignatureFromTransaction,
  type Instruction,
  type InstructionPlanInput,
  lamports,
  type MessagePartialSigner,
  passthroughFailedTransactionPlanExecution,
  pipe,
  type RequestAirdropApi,
  type Rpc,
  type RpcSubscriptions,
  type SendTransactionApi,
  type SignatureNotificationsApi,
  type SlotNotificationsApi,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signature,
  signTransactionMessageWithSigners,
  summarizeTransactionPlanResult,
  type TransactionPartialSigner,
  type TransactionPlanInput,
  type TransactionPlanResult,
} from "@solana/kit";

/** The subset of a kit client that this module needs to send transactions. */
export interface TransactionClient {
  rpc: Rpc<
    GetLatestBlockhashApi &
      GetEpochInfoApi &
      GetSignatureStatusesApi &
      SendTransactionApi
  >;
  rpcSubscriptions: RpcSubscriptions<
    SignatureNotificationsApi & SlotNotificationsApi
  >;
  sendTransactions(
    plan: InstructionPlanInput | TransactionPlanInput,
    config?: { abortSignal?: AbortSignal },
  ): Promise<TransactionPlanResult>;
}

/** A client whose RPC supports local airdrops, such as the loopback cluster. */
export interface AirdropClient {
  rpc: Rpc<RequestAirdropApi & GetSignatureStatusesApi>;
}

/**
 * Structured outcome of a send that did not fully succeed.
 *
 * A signature is only ever in one bucket: `failedSignatures` when the chain
 * reports an error for it, `confirmedSignatures` when it landed successfully,
 * and `unresolvedSignatures` when the chain gives no definitive answer.
 */
export interface TransactionFailure {
  /** Signatures known to have landed on chain successfully. */
  confirmedSignatures: string[];
  /** Signatures the chain reports as failed. */
  failedSignatures: string[];
  /** Signatures with no definitive on-chain outcome. Never resubmit these automatically. */
  unresolvedSignatures: string[];
  /** Description of what went wrong. */
  cause: string;
}

/** An error carrying the structured {@link TransactionFailure} that caused it. */
export class TransactionFailureError extends Error {
  readonly failure: TransactionFailure;

  constructor(failure: TransactionFailure) {
    super(failure.cause);
    this.name = "TransactionFailureError";
    this.failure = failure;
  }
}

/**
 * Classify signatures by their on-chain outcome via `getSignatureStatuses`.
 *
 * Error statuses are checked before confirmation status, so a failed
 * transaction is reported as failed even when it reached a confirmed block.
 * Signatures with no status, or only a `processed` status, are unresolved.
 */
export interface ReconciledSignatures {
  /** Confirmed or finalized on chain with no error. */
  confirmed: string[];
  /** The chain reports an error for the signature. */
  failed: string[];
  /** No definitive outcome. Never resubmit these automatically. */
  unresolved: string[];
}

export async function reconcileSignatures(
  client: { rpc: Rpc<GetSignatureStatusesApi> },
  signatures: readonly string[],
): Promise<ReconciledSignatures> {
  const reconciled: ReconciledSignatures = {
    confirmed: [],
    failed: [],
    unresolved: [],
  };
  if (signatures.length === 0) {
    return reconciled;
  }
  let statuses: Awaited<
    ReturnType<
      ReturnType<Rpc<GetSignatureStatusesApi>["getSignatureStatuses"]>["send"]
    >
  >["value"];
  try {
    ({ value: statuses } = await client.rpc
      .getSignatureStatuses(
        signatures.map((value) => signature(value)),
        {
          searchTransactionHistory: true,
        },
      )
      .send({ abortSignal: AbortSignal.timeout(5_000) }));
  } catch {
    return { ...reconciled, unresolved: [...signatures] };
  }
  signatures.forEach((signature, index) => {
    const status = Array.isArray(statuses) ? statuses[index] : undefined;
    if (status?.err) {
      reconciled.failed.push(signature);
    } else if (
      status &&
      (status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized")
    ) {
      reconciled.confirmed.push(signature);
    } else {
      reconciled.unresolved.push(signature);
    }
  });
  return reconciled;
}

/**
 * Send one transaction built from raw instructions; return its signature.
 *
 * The signature is captured before sending. If sending or confirming throws,
 * the chain is queried once to classify the outcome: known success returns the
 * signature, known failure or an uncertain outcome throws a
 * {@link TransactionFailureError}. The transaction is never resubmitted.
 */
export async function sendInstructions(
  client: TransactionClient,
  feePayer: TransactionPartialSigner & MessagePartialSigner,
  instructions: readonly Instruction[],
): Promise<string> {
  if (instructions.length === 0) {
    throw new Error("Refusing to send an empty transaction");
  }
  const { value: latestBlockhash } = await client.rpc
    .getLatestBlockhash()
    .send();
  const transaction = await pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(feePayer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
    (tx) => signTransactionMessageWithSigners(tx),
  );
  assertIsSendableTransaction(transaction);
  assertIsTransactionWithBlockhashLifetime(transaction);
  const signature = getSignatureFromTransaction(transaction);
  try {
    await sendAndConfirmTransactionFactory({
      rpc: client.rpc,
      rpcSubscriptions: client.rpcSubscriptions,
    })(transaction, { commitment: "confirmed" });
    return signature;
  } catch (thrown) {
    const reconciled = await reconcileSignatures(client, [signature]);
    if (reconciled.confirmed.length > 0) {
      return signature;
    }
    throw new TransactionFailureError({
      confirmedSignatures: [],
      failedSignatures: reconciled.failed,
      unresolvedSignatures: reconciled.unresolved,
      cause: thrown instanceof Error ? thrown.message : String(thrown),
    });
  }
}

/** The result of {@link sendPlanDetailed}. */
export interface DetailedPlanResult {
  /** Confirmed signatures from the plan, in result order. */
  signatures: string[];
  /** Present when any transaction in the plan failed or was canceled. */
  failure: TransactionFailure | null;
}

/**
 * Execute an instruction plan and report its outcome without throwing for
 * transaction failures. Failed and canceled entries are reconciled against
 * the chain so every partial signature is preserved and classified.
 */
export async function sendPlanDetailed(
  client: TransactionClient,
  plan: InstructionPlanInput | TransactionPlanInput,
): Promise<DetailedPlanResult> {
  let result: TransactionPlanResult;
  try {
    result = await passthroughFailedTransactionPlanExecution(
      client.sendTransactions(plan),
    );
  } catch (thrown) {
    return {
      signatures: [],
      failure: {
        confirmedSignatures: [],
        failedSignatures: [],
        unresolvedSignatures: [],
        cause: thrown instanceof Error ? thrown.message : String(thrown),
      },
    };
  }
  const summary = summarizeTransactionPlanResult(result);
  const confirmedSignatures = summary.successfulTransactions.map((tx) =>
    tx.context.signature.toString(),
  );
  if (summary.successful) {
    return { signatures: confirmedSignatures, failure: null };
  }
  const partialSignatures = [
    ...summary.failedTransactions.flatMap((tx) =>
      tx.context.signature ? [tx.context.signature.toString()] : [],
    ),
    ...summary.canceledTransactions.flatMap((tx) =>
      tx.context.signature ? [tx.context.signature.toString()] : [],
    ),
  ];
  const reconciled = await reconcileSignatures(client, partialSignatures);
  const cause =
    summary.failedTransactions.length > 0
      ? `Instruction plan failed with ${summary.failedTransactions.length} failed transaction(s)`
      : `Instruction plan was canceled with ${summary.canceledTransactions.length} canceled transaction(s)`;
  return {
    signatures: confirmedSignatures,
    failure: {
      confirmedSignatures: [...confirmedSignatures, ...reconciled.confirmed],
      failedSignatures: reconciled.failed,
      unresolvedSignatures: reconciled.unresolved,
      cause,
    },
  };
}

/**
 * Send an instruction plan; return the confirmed signatures. Throws a
 * {@link TransactionFailureError} if the plan did not fully succeed.
 */
export async function sendPlanConfirmed(
  client: TransactionClient,
  plan: InstructionPlanInput | TransactionPlanInput,
): Promise<string[]> {
  const { signatures, failure } = await sendPlanDetailed(client, plan);
  if (failure) {
    throw new TransactionFailureError(failure);
  }
  return signatures;
}

/** Request a local airdrop and wait for confirmation. */
export async function airdropConfirmed(
  client: AirdropClient,
  recipient: Address,
  amount: bigint,
): Promise<string> {
  const signature = await client.rpc
    .requestAirdrop(recipient, lamports(amount))
    .send();
  const deadline = Date.now() + 30_000;
  for (;;) {
    const reconciled = await reconcileSignatures(client, [signature]);
    if (reconciled.failed.length > 0) {
      throw new Error(`Airdrop failed: ${signature}`);
    }
    if (reconciled.confirmed.length > 0) {
      return signature;
    }
    if (Date.now() > deadline) {
      throw new Error(`Airdrop timed out: ${signature}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
