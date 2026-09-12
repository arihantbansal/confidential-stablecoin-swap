import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { address } from "@solana/kit";

const RUNTIME_DIR = dirname(fileURLToPath(import.meta.url));

export const RPC_HTTP_URL = "http://127.0.0.1:8899";
export const RPC_WS_URL = "ws://127.0.0.1:8900";

export const WRAPPER_PROGRAM_ADDRESS = address(
  "GxEQHbmE777LzkJjLX2EV7t1n37bZq1gD47gC8Xp9i9m",
);

export const FUND_AMOUNT_A = 100_000_000n;
export const TRANSFER_AMOUNT_B = 30_000_000n;
export const REDEEM_AMOUNT_A = 70_000_000n;

export const ASSETS = [
  {
    symbol: "USDC",
    mint: address("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"),
    decimals: 6,
    tokenProgram: "legacy" as const,
  },
  {
    symbol: "USDT",
    mint: address("Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"),
    decimals: 6,
    tokenProgram: "legacy" as const,
  },
  {
    symbol: "CASH",
    mint: address("CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH"),
    decimals: 6,
    tokenProgram: "token2022" as const,
  },
] as const;

export const KEYS_DIR = resolve(RUNTIME_DIR, "..", "..", ".keys");
export const LOCAL_JSON_PATH = resolve(RUNTIME_DIR, "..", "local.json");
export const RESULTS_JSON_PATH = resolve(RUNTIME_DIR, "..", "results.json");
