import {
  type Address,
  appendTransactionMessageInstructions,
  assertIsSendableTransaction,
  assertIsTransactionWithBlockhashLifetime,
  createClient,
  createTransactionMessage,
  getSignatureFromTransaction,
  type Instruction,
  type MessagePartialSigner,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  summarizeTransactionPlanResult,
  type TransactionPartialSigner,
} from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { payer } from "@solana/kit-plugin-signer";
import {
  AeKey,
  ElGamalKeypair,
  ElGamalSecretKey,
} from "@solana/zk-sdk/bundler";
import {
  deriveAeKeyForOwnerMint,
  deriveElGamalKeypairForOwnerMint,
} from "@solana-program/token-2022/confidential";
import type { LocalManifest } from "@/lib/manifest";

export interface SessionKeys {
  elgamalKeypair: ElGamalKeypair;
  elgamalSecretKey: ElGamalSecretKey;
  aesKey: AeKey;
}

export type FullSigner = TransactionPartialSigner & MessagePartialSigner;

export interface Session {
  manifest: LocalManifest;
  client: SessionClient;
  signer: FullSigner;
  owner: Address;
  keys: SessionKeys | null;
}

export type SessionClient = ReturnType<typeof createSessionClient>;

export function createSessionClient(
  manifest: LocalManifest,
  feePayer: FullSigner,
) {
  return createClient()
    .use(payer(feePayer))
    .use(
      solanaRpc({
        rpcUrl: manifest.rpcHttpUrl,
        rpcSubscriptionsUrl: manifest.rpcWsUrl,
        transactionConfig: { estimateResourceLimits: false },
      }),
    );
}

export function createSession(
  manifest: LocalManifest,
  signer: FullSigner,
  owner: Address,
): Session {
  return {
    manifest,
    client: createSessionClient(manifest, signer),
    signer,
    owner,
    keys: null,
  };
}

export async function deriveKeys(
  signer: MessagePartialSigner,
  owner: Address,
  mint: Address,
): Promise<SessionKeys> {
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

export function freeSessionKeys(session: Session): void {
  session.keys?.elgamalKeypair.free();
  session.keys?.elgamalSecretKey.free();
  session.keys?.aesKey.free();
  session.keys = null;
}

export async function sendSingle(
  session: Session,
  instructions: readonly Instruction[],
): Promise<string> {
  if (instructions.length === 0) {
    throw new Error("Refusing to send an empty transaction");
  }
  const { value: latestBlockhash } = await session.client.rpc
    .getLatestBlockhash()
    .send();
  const transaction = await pipe(
    createTransactionMessage({ version: 0 }),
    (tx) => setTransactionMessageFeePayerSigner(session.signer, tx),
    (tx) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, tx),
    (tx) => appendTransactionMessageInstructions(instructions, tx),
    (tx) => signTransactionMessageWithSigners(tx),
  );
  assertIsSendableTransaction(transaction);
  assertIsTransactionWithBlockhashLifetime(transaction);
  const signature = getSignatureFromTransaction(transaction);
  await sendAndConfirmTransactionFactory({
    rpc: session.client.rpc,
    rpcSubscriptions: session.client.rpcSubscriptions,
  })(transaction, { commitment: "confirmed" });
  return signature;
}

export async function sendPlan(
  session: Session,
  plan: Parameters<SessionClient["sendTransactions"]>[0],
): Promise<string[]> {
  const result = await session.client.sendTransactions(plan);
  const summary = summarizeTransactionPlanResult(result);
  if (summary.failedTransactions.length > 0) {
    throw new Error(
      `Transaction plan failed with ${summary.failedTransactions.length} failed transaction(s)`,
    );
  }
  return summary.successfulTransactions.map((tx) =>
    tx.context.signature.toString(),
  );
}
