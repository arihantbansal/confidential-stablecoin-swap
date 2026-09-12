import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  getAddressEncoder,
} from "@solana/kit";
import { KEYS_DIR } from "#runtime/config";

type LocalIdentity = "local-payer" | "user-a" | "user-b";

export async function loadOrCreateSigner(name: LocalIdentity) {
  const path = join(KEYS_DIR, `${name}.json`);
  mkdirSync(KEYS_DIR, { recursive: true, mode: 0o700 });
  if (existsSync(path)) {
    const bytes = JSON.parse(readFileSync(path, "utf8"));
    if (
      !Array.isArray(bytes) ||
      bytes.length !== 64 ||
      !bytes.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
    ) {
      throw new Error(`Invalid local key file: ${name}.json`);
    }
    return createKeyPairSignerFromBytes(new Uint8Array(bytes));
  }
  const seed = crypto.getRandomValues(new Uint8Array(32));
  const signer = await createKeyPairSignerFromPrivateKeyBytes(seed);
  const bytes = new Uint8Array(64);
  bytes.set(seed);
  bytes.set(getAddressEncoder().encode(signer.address), 32);
  try {
    writeFileSync(path, JSON.stringify(Array.from(bytes)), { mode: 0o600 });
  } finally {
    seed.fill(0);
    bytes.fill(0);
  }
  return signer;
}
