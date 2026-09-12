import {
  sendInstructions as sendInstructionsConfirmed,
  sendPlanConfirmed,
} from "@confidential-stablecoin/runtime/transactions";
import {
  type Address,
  createClient,
  type Instruction,
  type MessagePartialSigner,
  type TransactionPartialSigner,
} from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { payer } from "@solana/kit-plugin-signer";
import type {
  AeKey,
  ElGamalKeypair,
  ElGamalSecretKey,
} from "@solana/zk-sdk/bundler";
import type { LocalAsset, LocalManifest } from "@/lib/manifest";

export interface SessionKeys {
  elgamalKeypair: ElGamalKeypair;
  elgamalSecretKey: ElGamalSecretKey;
  aesKey: AeKey;
}

export type FullSigner = TransactionPartialSigner & MessagePartialSigner;

export interface Session {
  manifest: LocalManifest;
  selectedAsset: LocalAsset;
  client: SessionClient;
  signer: FullSigner;
  owner: Address;
  keys: SessionKeys | null;
  unlockingKeys: Promise<SessionKeys> | null;
  keyUseCount: number;
  disposeKeysWhenIdle: boolean;
  disposed: boolean;
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

/** One RPC client shared by every asset session for a connected wallet. */
export function createSessions(
  manifest: LocalManifest,
  signer: FullSigner,
  owner: Address,
): Map<string, Session> {
  const client = createSessionClient(manifest, signer);
  return new Map(
    manifest.assets.map((asset) => [
      asset.mint.toString(),
      {
        manifest,
        selectedAsset: asset,
        client,
        signer,
        owner,
        keys: null,
        unlockingKeys: null,
        keyUseCount: 0,
        disposeKeysWhenIdle: false,
        disposed: false,
      },
    ]),
  );
}

export async function deriveKeys(
  signer: MessagePartialSigner,
  owner: Address,
  mint: Address,
): Promise<SessionKeys> {
  // Lazy-load the WASM-backed key derivation so this module stays cheap to
  // import until keys are actually needed.
  const [
    { AeKey, ElGamalKeypair, ElGamalSecretKey },
    { deriveAeKeyForOwnerMint, deriveElGamalKeypairForOwnerMint },
  ] = await Promise.all([
    import("@solana/zk-sdk/bundler"),
    import("@solana-program/token-2022/confidential"),
  ]);
  const derived = await deriveElGamalKeypairForOwnerMint({
    signer,
    owner,
    mint,
  });
  const secretBytes = derived.secretKey;
  let elgamalSecretKey: ElGamalSecretKey | null = null;
  let elgamalKeypair: ElGamalKeypair | null = null;
  let aesKey: AeKey | null = null;
  try {
    elgamalSecretKey = ElGamalSecretKey.fromBytes(secretBytes);
    elgamalKeypair = ElGamalKeypair.fromSecretKey(elgamalSecretKey);
    const aeBytes = await deriveAeKeyForOwnerMint({ signer, owner, mint });
    try {
      aesKey = AeKey.fromBytes(aeBytes);
    } finally {
      aeBytes.fill(0);
    }
    return { elgamalKeypair, elgamalSecretKey, aesKey };
  } catch (error) {
    elgamalKeypair?.free();
    elgamalSecretKey?.free();
    throw error;
  } finally {
    secretBytes.fill(0);
  }
}

export function freeSessionKeys(session: Session): void {
  session.disposed = true;
  if (session.keyUseCount > 0) {
    session.disposeKeysWhenIdle = true;
    return;
  }
  disposeSessionKeys(session);
}

export function retainSessionKeys(session: Session): SessionKeys | null {
  if (!session.keys || session.disposed) {
    return null;
  }
  session.keyUseCount += 1;
  return session.keys;
}

export function releaseSessionKeys(session: Session): void {
  session.keyUseCount = Math.max(0, session.keyUseCount - 1);
  if (session.keyUseCount === 0 && session.disposeKeysWhenIdle) {
    disposeSessionKeys(session);
  }
}

export function disposeKeys(keys: SessionKeys): void {
  keys.elgamalKeypair.free();
  keys.elgamalSecretKey.free();
  keys.aesKey.free();
}

function disposeSessionKeys(session: Session): void {
  if (session.keys) {
    disposeKeys(session.keys);
  }
  session.keys = null;
  session.disposeKeysWhenIdle = false;
}

export async function sendSingle(
  session: Session,
  instructions: readonly Instruction[],
): Promise<string> {
  if (session.disposed) {
    throw new Error("Wallet session is disconnected");
  }
  return sendInstructionsConfirmed(
    session.client,
    session.signer,
    instructions,
  );
}

export async function sendPlan(
  session: Session,
  plan: Parameters<SessionClient["sendTransactions"]>[0],
): Promise<string[]> {
  if (session.disposed) {
    throw new Error("Wallet session is disconnected");
  }
  return sendPlanConfirmed(session.client, plan);
}
