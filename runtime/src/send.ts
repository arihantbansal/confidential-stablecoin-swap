import type { Instruction, KeyPairSigner } from "@solana/kit";
import type { RuntimeClient } from "#runtime/client";
import {
  airdropConfirmed,
  sendInstructions as sendInstructionsConfirmed,
  sendPlanConfirmed,
} from "#runtime/transactions";

export { airdropConfirmed };

/** Send one transaction built from raw instructions; return its signature. */
export async function sendInstructions(
  client: RuntimeClient,
  feePayer: KeyPairSigner,
  instructions: readonly Instruction[],
): Promise<string> {
  return sendInstructionsConfirmed(client, feePayer, instructions);
}

/** Send an instruction plan; return confirmed signatures. Throws on failure. */
export async function sendPlan(
  client: RuntimeClient,
  plan: Parameters<RuntimeClient["sendTransactions"]>[0],
): Promise<string[]> {
  return sendPlanConfirmed(client, plan);
}
