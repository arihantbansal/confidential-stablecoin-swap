import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { address, isAddress } from "@solana/kit";
import { findAssociatedTokenPda as findToken2022Ata } from "@solana-program/token-2022";
import type { Plugin } from "vite";

function reply(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

const LOCAL_RPC_URL = "http://127.0.0.1:8899";
const RPC_TIMEOUT_MS = 5_000;
const AIRDROP_TIMEOUT_MS = 30_000;

class AirdropTimeoutError extends Error {
  constructor(public readonly signature: string) {
    super(`Airdrop confirmation timed out: ${signature}`);
  }
}

function parseDeployment(): {
  rpcHttpUrl: string;
  assets: Array<{
    symbol: string;
    mint: string;
    decimals: number;
    tokenProgram: string;
  }>;
} {
  const deployment: unknown = JSON.parse(
    readFileSync(new URL("../runtime/local.json", import.meta.url), "utf8"),
  );
  if (!deployment || typeof deployment !== "object")
    throw new Error("Local deployment manifest must be an object");
  const { rpcHttpUrl, assets } = deployment as {
    rpcHttpUrl?: unknown;
    assets?: unknown;
  };
  if (rpcHttpUrl !== LOCAL_RPC_URL)
    throw new Error(`Local RPC must be ${LOCAL_RPC_URL}`);
  if (!Array.isArray(assets))
    throw new Error("Local deployment assets must be an array");
  const parsedAssets = assets.map((candidate) => {
    if (!candidate || typeof candidate !== "object")
      throw new Error("Invalid local deployment asset");
    const {
      symbol,
      mint,
      decimals: rawDecimals,
      tokenProgram,
    } = candidate as {
      symbol?: unknown;
      mint?: unknown;
      decimals?: unknown;
      tokenProgram?: unknown;
    };
    const decimals = typeof rawDecimals === "number" ? rawDecimals : NaN;
    if (
      typeof symbol !== "string" ||
      typeof mint !== "string" ||
      typeof tokenProgram !== "string" ||
      !Number.isInteger(decimals) ||
      decimals < 0 ||
      decimals > 13
    ) {
      throw new Error("Invalid local deployment asset");
    }
    return { symbol, mint, decimals, tokenProgram };
  });
  return { rpcHttpUrl: LOCAL_RPC_URL, assets: parsedAssets };
}

async function waitForAirdrop(
  rpcCall: <T>(method: string, params: unknown[]) => Promise<T>,
  recipient: string,
): Promise<string> {
  const signature = await rpcCall<string>("requestAirdrop", [
    recipient,
    1_000_000_000,
  ]);
  const deadline = Date.now() + AIRDROP_TIMEOUT_MS;
  for (;;) {
    let statuses: {
      value: Array<{
        err?: unknown;
        confirmationStatus?: string | null;
      } | null>;
    };
    try {
      statuses = await rpcCall("getSignatureStatuses", [[signature]]);
    } catch {
      throw new AirdropTimeoutError(signature);
    }
    const status = statuses.value[0];
    if (status?.err) {
      throw new Error(`Airdrop failed: ${JSON.stringify(status.err)}`);
    }
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return signature;
    }
    if (Date.now() >= deadline) throw new AirdropTimeoutError(signature);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

async function fund(request: IncomingMessage, response: ServerResponse) {
  const host = request.headers.host;
  const origin = request.headers.origin;
  // Only the local app may mutate local Surfpool token fixtures.
  if (
    !host ||
    !/^(localhost|127\.0\.0\.1):\d+$/.test(host) ||
    origin !== `http://${host}`
  ) {
    reply(response, 403, { error: "Local app origin required" });
    return;
  }
  if (request.method !== "POST") {
    reply(response, 405, { error: "POST required" });
    return;
  }
  if (request.headers["content-type"] !== "application/json") {
    reply(response, 415, { error: "JSON required" });
    return;
  }
  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 1024) {
      reply(response, 413, { error: "Request too large" });
      return;
    }
  }
  let input: { address: string; symbol: string };
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      throw new Error("Request body must be an object");
    input = parsed as { address: string; symbol: string };
  } catch {
    reply(response, 400, { error: "Malformed JSON body" });
    return;
  }
  if (
    typeof input.address !== "string" ||
    !isAddress(input.address) ||
    typeof input.symbol !== "string"
  ) {
    reply(response, 400, { error: "Invalid wallet address" });
    return;
  }
  let deployment: ReturnType<typeof parseDeployment>;
  try {
    deployment = parseDeployment();
  } catch (error) {
    reply(response, 500, {
      error:
        error instanceof Error ? error.message : "Invalid local deployment",
    });
    return;
  }
  const asset = deployment.assets.find(
    (candidate) => candidate.symbol === input.symbol,
  );
  if (!asset) {
    reply(response, 400, { error: "Unknown asset" });
    return;
  }
  const rpcCall = async <T>(method: string, params: unknown[]): Promise<T> => {
    const response = await fetch(deployment.rpcHttpUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
      signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
    });
    let result: { result?: T; error?: unknown };
    try {
      result = (await response.json()) as { result?: T; error?: unknown };
    } catch {
      throw new Error(`Local RPC ${method} returned malformed JSON`);
    }
    if (!response.ok || result.error) {
      throw new Error(
        `Local RPC ${method} failed: ${JSON.stringify(result.error ?? response.status)}`,
      );
    }
    return result.result as T;
  };
  const lamports = await rpcCall<{ value: number }>("getBalance", [
    input.address,
    { commitment: "confirmed" },
  ]);
  if (lamports.value < 200_000_000) {
    try {
      await waitForAirdrop(rpcCall, input.address);
    } catch (error) {
      if (error instanceof AirdropTimeoutError) {
        reply(response, 504, {
          error: error.message,
          signature: error.signature,
        });
        return;
      }
      throw error;
    }
  }
  const owner = address(input.address);
  const mint = address(asset.mint);
  const tokenProgram = address(asset.tokenProgram);
  const [ata] = await findToken2022Ata({ owner, mint, tokenProgram });
  const tokenAccount = await rpcCall<{ value: unknown }>("getAccountInfo", [
    ata,
    { encoding: "base64", commitment: "confirmed" },
  ]);
  const currentAmount =
    tokenAccount.value === null
      ? 0n
      : BigInt(
          (
            await rpcCall<{ value: { amount: string } }>(
              "getTokenAccountBalance",
              [ata, { commitment: "confirmed" }],
            )
          ).value.amount,
        );
  const targetAmount = 100n * 10n ** BigInt(asset.decimals);
  if (currentAmount >= targetAmount) {
    reply(response, 200, {
      funded: input.address,
      symbol: asset.symbol,
      signatures: [],
    });
    return;
  }
  const targetAmountNumber = Number(targetAmount);
  if (!Number.isSafeInteger(targetAmountNumber)) {
    reply(response, 500, { error: "Asset funding amount exceeds safe range" });
    return;
  }
  try {
    await rpcCall("surfnet_setTokenAccount", [
      input.address,
      asset.mint,
      { amount: targetAmountNumber },
      asset.tokenProgram,
    ]);
  } catch (error) {
    reply(response, 502, {
      error: `Local funding failed: ${error instanceof Error ? error.message : String(error)}`,
    });
    return;
  }
  reply(response, 200, {
    funded: input.address,
    symbol: asset.symbol,
    signatures: [],
  });
}

export function localFunding(): Plugin {
  return {
    name: "local-test-funding",
    configureServer(server) {
      server.middlewares.use("/api/local-fund", (request, response) => {
        void fund(request, response).catch((error: Error) => {
          if (!response.writableEnded)
            reply(response, 500, { error: error.message });
        });
      });
    },
  };
}
