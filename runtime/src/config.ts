import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { address } from "@solana/kit";

const RUNTIME_DIR = dirname(fileURLToPath(import.meta.url));

export const RPC_HTTP_URL = "http://127.0.0.1:8899";
export const RPC_WS_URL = "ws://127.0.0.1:8900";

export const WRAPPER_PROGRAM_ADDRESS = address(
  "GxEQHbmE777LzkJjLX2EV7t1n37bZq1gD47gC8Xp9i9m",
);

export const TEST_USD_DECIMALS = 6;
export const FUND_AMOUNT_A = 100_000_000n; // 100 Test USD
export const TRANSFER_AMOUNT_B = 30_000_000n; // 30 Test USD
export const REDEEM_AMOUNT_A = 70_000_000n; // 70 Test USD

export const KEYS_DIR = resolve(RUNTIME_DIR, "..", "..", ".keys");
export const LOCAL_JSON_PATH = resolve(RUNTIME_DIR, "..", "local.json");
export const RESULTS_JSON_PATH = resolve(RUNTIME_DIR, "..", "results.json");
