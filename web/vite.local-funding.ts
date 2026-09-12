import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createRuntimeClient } from "@confidential-stablecoin/runtime/client";
import {
  airdropConfirmed,
  sendInstructions,
} from "@confidential-stablecoin/runtime/send";
import { address, createKeyPairSignerFromBytes, isAddress } from "@solana/kit";
import {
  fetchToken,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getMintToInstruction,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import type { Plugin } from "vite";

function reply(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

async function loadSigner(name: "local-payer" | "mint-authority") {
  const path = new URL(`../.keys/${name}.json`, import.meta.url);
  return createKeyPairSignerFromBytes(
    new Uint8Array(JSON.parse(readFileSync(path, "utf8"))),
  );
}

async function fund(request: IncomingMessage, response: ServerResponse) {
  const host = request.headers.host;
  const origin = request.headers.origin;
  // Only the local app may use the local mint authority.
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
  const input: { address: string } = JSON.parse(body);
  if (typeof input.address !== "string" || !isAddress(input.address)) {
    reply(response, 400, { error: "Invalid wallet address" });
    return;
  }
  const owner = address(input.address);
  const deployment: { testUsd: { mint: string } } = JSON.parse(
    readFileSync(new URL("../runtime/local.json", import.meta.url), "utf8"),
  );
  const mint = address(deployment.testUsd.mint);
  const [feePayer, mintAuthority] = await Promise.all([
    loadSigner("local-payer"),
    loadSigner("mint-authority"),
  ]);
  const client = createRuntimeClient(feePayer);
  const signatures: string[] = [];
  if ((await client.rpc.getBalance(owner).send()).value < 200_000_000n) {
    signatures.push(await airdropConfirmed(client, owner, 1_000_000_000n));
  }
  const [token] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  await sendInstructions(client, feePayer, [
    getCreateAssociatedTokenIdempotentInstruction({
      payer: feePayer,
      owner,
      mint,
      ata: token,
    }),
  ]);
  const balance = (await fetchToken(client.rpc, token)).data.amount;
  if (balance < 100_000_000n) {
    signatures.push(
      await sendInstructions(client, feePayer, [
        getMintToInstruction({
          mint,
          token,
          mintAuthority,
          amount: 100_000_000n - balance,
        }),
      ]),
    );
  }
  reply(response, 200, { funded: owner, testUsdAccount: token, signatures });
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
