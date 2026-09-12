import type { KeyPairSigner } from "@solana/kit";
import { createClient } from "@solana/kit";
import { solanaRpc } from "@solana/kit-plugin-rpc";
import { payer } from "@solana/kit-plugin-signer";
import { RPC_HTTP_URL, RPC_WS_URL } from "#runtime/config";

/** Loopback RPC only. Estimation disabled so proof transactions fit the size cap. */
export function createRuntimeClient(feePayer: KeyPairSigner) {
  return createClient()
    .use(payer(feePayer))
    .use(
      solanaRpc({
        rpcUrl: RPC_HTTP_URL,
        rpcSubscriptionsUrl: RPC_WS_URL,
        transactionConfig: { estimateResourceLimits: false },
      }),
    );
}

export type RuntimeClient = ReturnType<typeof createRuntimeClient>;
