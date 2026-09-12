import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { address, isAddress } from "@solana/kit";
import { findAssociatedTokenPda as findToken2022Ata } from "@solana-program/token-2022";
import type { Plugin } from "vite";

function reply(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
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
  const input: { address: string; symbol: string } = JSON.parse(body);
  if (
    typeof input.address !== "string" ||
    !isAddress(input.address) ||
    typeof input.symbol !== "string"
  ) {
    reply(response, 400, { error: "Invalid wallet address" });
    return;
  }
  const deployment: {
    rpcHttpUrl: string;
    assets: Array<{ symbol: string; mint: string; tokenProgram: string }>;
  } = JSON.parse(
    readFileSync(new URL("../runtime/local.json", import.meta.url), "utf8"),
  );
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
    });
    const result = (await response.json()) as { result?: T; error?: unknown };
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
    await rpcCall<string>("requestAirdrop", [input.address, 1_000_000_000]);
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
  if (currentAmount >= 100_000_000n) {
    reply(response, 200, {
      funded: input.address,
      symbol: asset.symbol,
      signatures: [],
    });
    return;
  }
  const rpc = await fetch(deployment.rpcHttpUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "surfnet_setTokenAccount",
      params: [
        input.address,
        asset.mint,
        { amount: 100_000_000 },
        asset.tokenProgram,
      ],
    }),
  });
  const result = (await rpc.json()) as { error?: unknown };
  if (!rpc.ok || result.error) {
    reply(response, 502, {
      error: `Local funding failed: ${JSON.stringify(result.error ?? rpc.status)}`,
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
