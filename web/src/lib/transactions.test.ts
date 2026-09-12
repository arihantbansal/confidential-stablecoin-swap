import {
  type AirdropClient,
  airdropConfirmed,
  reconcileSignatures,
  sendInstructions,
  sendPlanDetailed,
  type TransactionClient,
  TransactionFailureError,
} from "@confidential-stablecoin/runtime/transactions";
import {
  address,
  createFailedToExecuteTransactionPlanError,
  createTransactionMessage,
  failedSingleTransactionPlanResult,
  generateKeyPairSigner,
  getBase58Decoder,
  parallelTransactionPlanResult,
  setTransactionMessageFeePayer,
  successfulSingleTransactionPlanResult,
  type TransactionPlan,
} from "@solana/kit";
import { describe, expect, it } from "vitest";

const SIG_A =
  "2AXDGYSE4f2sz7tvMMzyHvUfcoJmxudvdhBcmiUSo6ijwfYmfZYsKRxboQMPh3R4kUhXRVdtSXFXMheka4Rc4P2";
const SIG_B =
  "3L3RY5sT8K4kyEnqhizwaqxLEbcYvpGrGPNEYRwtbCSUtL6YL86jdrvCbohnP5q8VxQ3qzGmt3W3iQJW97rD7m3";
const SIG_C =
  "4VZdodJgBy6dxMgm45zusmRzrPvKtiumu5YrK9RLPJADpzeJzgebxHsoQD4B58FCFS6aGUufKZka56xFiBGpB94";
const SIG_D =
  "5f5r5AjuFd8WwUagQSztAgufUCE6rdYhXmjU5rtnBPsxmfC5fFCUGiqQCcQZmAfFzuo6gyYYm616Roc1HEhREX5";
const RECIPIENT = address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const BLOCKHASH = getBase58Decoder().decode(new Uint8Array(32).fill(7));

function status(err: unknown, confirmationStatus: string | null) {
  return { err, confirmationStatus };
}

function fakeClient(methods: Record<string, unknown>): TransactionClient {
  return { rpc: methods } as unknown as TransactionClient;
}

function fakeAirdropClient(statuses: unknown): AirdropClient {
  return {
    rpc: {
      requestAirdrop: () => ({ send: async () => SIG_A }),
      getSignatureStatuses: () => ({
        send: async () => ({ value: statuses }),
      }),
    },
  } as unknown as AirdropClient;
}

function noopInstruction() {
  return {
    programAddress: address("11111111111111111111111111111111"),
    accounts: [],
    data: new Uint8Array(),
  };
}

function sendingClient(
  statuses: unknown,
  options: { emitConfirmation?: boolean; rejectSend?: boolean } = {},
): TransactionClient {
  const emitConfirmation = options.emitConfirmation ?? statuses === null;
  return {
    rpc: {
      getLatestBlockhash: () => ({
        send: async () => ({
          value: { blockhash: BLOCKHASH, lastValidBlockHeight: 100n },
        }),
      }),
      getEpochInfo: () => ({
        send: async () => ({ value: { absoluteSlot: 1n, blockHeight: 0n } }),
      }),
      sendTransaction: () => ({
        send: async () => {
          if (options.rejectSend) throw new Error("timeout");
          return SIG_A;
        },
      }),
      getSignatureStatuses: () => ({
        send: async () => ({ value: statuses }),
      }),
    },
    rpcSubscriptions: {
      signatureNotifications: () => ({
        subscribe: async () => ({
          async *[Symbol.asyncIterator]() {
            if (emitConfirmation) yield { value: { err: null } };
            await new Promise(() => {});
          },
        }),
      }),
      slotNotifications: () => ({
        subscribe: async () => ({
          async *[Symbol.asyncIterator]() {
            await new Promise(() => {});
          },
        }),
      }),
    },
  } as unknown as TransactionClient;
}

describe("reconcileSignatures", () => {
  it("classifies error statuses before confirmation status", async () => {
    const client = fakeClient({
      getSignatureStatuses: () => ({
        send: async () => ({
          value: [
            status(null, "confirmed"),
            status({ InstructionError: [0, "Custom"] }, "confirmed"),
            status(null, "processed"),
            null,
          ],
        }),
      }),
    });
    const result = await reconcileSignatures(client, [
      SIG_A,
      SIG_B,
      SIG_C,
      SIG_D,
    ]);
    expect(result).toEqual({
      confirmed: [SIG_A],
      failed: [SIG_B],
      unresolved: [SIG_C, SIG_D],
    });
  });

  it("reports every signature unresolved when the status query fails", async () => {
    const client = fakeClient({
      getSignatureStatuses: () => ({
        send: async () => {
          throw new Error("rpc offline");
        },
      }),
    });
    const result = await reconcileSignatures(client, [SIG_A]);
    expect(result).toEqual({
      confirmed: [],
      failed: [],
      unresolved: [SIG_A],
    });
  });
});

describe("airdropConfirmed", () => {
  it("throws when the airdrop failed even though the failed transaction confirmed", async () => {
    const client = fakeAirdropClient([
      status({ InstructionError: [0, "Custom"] }, "confirmed"),
    ]);
    await expect(airdropConfirmed(client, RECIPIENT, 1n)).rejects.toThrow(
      "Airdrop failed",
    );
  });

  it("returns the signature once the airdrop confirms", async () => {
    const client = fakeAirdropClient([status(null, "confirmed")]);
    await expect(airdropConfirmed(client, RECIPIENT, 1n)).resolves.toBe(SIG_A);
  });
});

describe("sendInstructions", () => {
  it("returns the signature captured before sending", async () => {
    const feePayer = await generateKeyPairSigner();
    const signature = await sendInstructions(
      sendingClient([status(null, "confirmed")], { emitConfirmation: true }),
      feePayer,
      [noopInstruction()],
    );
    expect(signature.length).toBeGreaterThan(0);
  });

  it("throws a structured failure instead of resubmitting when the chain reports an error", async () => {
    const feePayer = await generateKeyPairSigner();
    const client = sendingClient([
      status({ InstructionError: [0, "Custom"] }, "confirmed"),
    ]);
    const error = await sendInstructions(client, feePayer, [
      noopInstruction(),
    ]).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(TransactionFailureError);
    expect(error.failure.failedSignatures).toHaveLength(1);
    expect(error.failure.unresolvedSignatures).toEqual([]);
  });

  it("reports the signature unresolved when the chain has no outcome", async () => {
    const feePayer = await generateKeyPairSigner();
    const client = sendingClient([null], { rejectSend: true });
    const error = await sendInstructions(client, feePayer, [
      noopInstruction(),
    ]).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(TransactionFailureError);
    expect(error.failure.unresolvedSignatures).toHaveLength(1);
    expect(error.failure.failedSignatures).toEqual([]);
  });
});

describe("sendPlanDetailed", () => {
  it("preserves and classifies partial signatures from a failed plan", async () => {
    const message = setTransactionMessageFeePayer(
      RECIPIENT,
      createTransactionMessage({ version: 0 }),
    );
    const result = parallelTransactionPlanResult([
      successfulSingleTransactionPlanResult(message, { signature: SIG_A }),
      failedSingleTransactionPlanResult(
        message,
        new Error("simulation failed"),
        {
          signature: SIG_B,
        },
      ),
    ]);
    const client = {
      sendTransactions: async () => result,
      rpc: {
        getSignatureStatuses: () => ({
          send: async () => ({
            value: [status({ InstructionError: [0, "Custom"] }, "confirmed")],
          }),
        }),
      },
    } as unknown as TransactionClient;
    const detailed = await sendPlanDetailed(client, {} as TransactionPlan);
    expect(detailed.signatures).toEqual([SIG_A]);
    expect(detailed.failure).toEqual({
      confirmedSignatures: [SIG_A],
      failedSignatures: [SIG_B],
      unresolvedSignatures: [],
      cause: "Instruction plan failed with 1 failed transaction(s)",
    });
  });

  it("keeps partial results when the SDK throws its plan execution error", async () => {
    const message = setTransactionMessageFeePayer(
      RECIPIENT,
      createTransactionMessage({ version: 0 }),
    );
    const partial = parallelTransactionPlanResult([
      successfulSingleTransactionPlanResult(message, { signature: SIG_A }),
      failedSingleTransactionPlanResult(message, new Error("send failed"), {
        signature: SIG_B,
      }),
    ]);
    const client = {
      sendTransactions: async () => {
        throw createFailedToExecuteTransactionPlanError(partial);
      },
      rpc: {
        getSignatureStatuses: () => ({
          send: async () => ({ value: [null] }),
        }),
      },
    } as unknown as TransactionClient;

    await expect(
      sendPlanDetailed(client, {} as TransactionPlan),
    ).resolves.toEqual({
      signatures: [SIG_A],
      failure: {
        confirmedSignatures: [SIG_A],
        failedSignatures: [],
        unresolvedSignatures: [SIG_B],
        cause: "Instruction plan failed with 1 failed transaction(s)",
      },
    });
  });
});
