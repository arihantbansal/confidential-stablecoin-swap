import {
  type Address,
  appendTransactionMessageInstructions,
  assertIsSendableTransaction,
  assertIsTransactionWithBlockhashLifetime,
  createTransactionMessage,
  getSignatureFromTransaction,
  type Instruction,
  type KeyPairSigner,
  lamports,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  summarizeTransactionPlanResult,
} from "@solana/kit";
import type { RuntimeClient } from "#runtime/client";

/** Send one transaction built from raw instructions; return its signature. */
export async function sendInstructions(
  client: RuntimeClient,
  feePayer: KeyPairSigner,
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
  await sendAndConfirmTransactionFactory({
    rpc: client.rpc,
    rpcSubscriptions: client.rpcSubscriptions,
  })(transaction, { commitment: "confirmed" });
  return signature;
}

/** Send an instruction plan; return confirmed signatures. Throws on failure. */
export async function sendPlan(
  client: RuntimeClient,
  plan: Parameters<RuntimeClient["sendTransactions"]>[0],
): Promise<string[]> {
  const result = await client.sendTransactions(plan);
  const summary = summarizeTransactionPlanResult(result);
  if (summary.failedTransactions.length > 0) {
    throw new Error(
      `Instruction plan failed with ${summary.failedTransactions.length} failed transaction(s)`,
    );
  }
  return summary.successfulTransactions.map((tx) =>
    tx.context.signature.toString(),
  );
}

/** Request a local airdrop and wait for confirmation. */
export async function airdropConfirmed(
  client: RuntimeClient,
  recipient: Address,
  amount: bigint,
): Promise<string> {
  const signature = await client.rpc
    .requestAirdrop(recipient, lamports(amount))
    .send();
  const deadline = Date.now() + 30_000;
  for (;;) {
    const { value } = await client.rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (
      status &&
      (status.confirmationStatus === "confirmed" ||
        status.confirmationStatus === "finalized")
    ) {
      return signature;
    }
    if (status?.err) {
      throw new Error(`Airdrop failed: ${JSON.stringify(status.err)}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`Airdrop timed out: ${signature}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
