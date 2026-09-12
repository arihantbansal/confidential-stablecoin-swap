import {
  createKeyPairSignerFromPrivateKeyBytes,
  generateKeyPairSigner,
  type KeyPairSigner,
} from "@solana/kit";

const ENVELOPE_VERSION = 1;
const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const IV_BYTES = 12;

interface RecoveryEnvelope {
  v: number;
  kdf: string;
  iterations: number;
  salt: string;
  iv: string;
  data: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function fromBase64Url(text: string): Uint8Array {
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64(
    padded.padEnd(padded.length + ((4 - (padded.length % 4)) % 4), "="),
  );
}

async function deriveFileKey(
  password: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: salt as BufferSource,
      iterations: PBKDF2_ITERATIONS,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function createTestWallet(): Promise<KeyPairSigner> {
  return generateKeyPairSigner(true);
}

export async function exportSecretBytes(
  signer: KeyPairSigner,
): Promise<Uint8Array> {
  const privateKey = (signer.keyPair as CryptoKeyPair).privateKey;
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  if (!jwk.d) {
    throw new Error("Test wallet key is not exportable");
  }
  return fromBase64Url(jwk.d);
}

export async function importTestWallet(
  secret: Uint8Array,
): Promise<KeyPairSigner> {
  if (secret.length !== 32 && secret.length !== 64) {
    throw new Error("Recovery file holds an invalid key");
  }
  return createKeyPairSignerFromPrivateKeyBytes(secret.slice(0, 32), true);
}

export async function encryptRecoveryFile(
  secret: Uint8Array,
  password: string,
): Promise<string> {
  if (password.length < 8) {
    throw new Error("Recovery password needs at least 8 characters");
  }
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveFileKey(password, salt);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      secret as BufferSource,
    ),
  );
  const envelope: RecoveryEnvelope = {
    v: ENVELOPE_VERSION,
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    data: toBase64(ciphertext),
  };
  return JSON.stringify(envelope);
}

export async function decryptRecoveryFile(
  text: string,
  password: string,
): Promise<Uint8Array> {
  let envelope: RecoveryEnvelope;
  try {
    envelope = JSON.parse(text) as RecoveryEnvelope;
  } catch {
    throw new Error("Recovery file is not valid JSON");
  }
  if (
    envelope.v !== ENVELOPE_VERSION ||
    envelope.kdf !== "PBKDF2-SHA256" ||
    typeof envelope.iterations !== "number" ||
    typeof envelope.salt !== "string" ||
    typeof envelope.iv !== "string" ||
    typeof envelope.data !== "string"
  ) {
    throw new Error("Recovery file has an unknown format");
  }
  const key = await deriveFileKey(password, fromBase64(envelope.salt));
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromBase64(envelope.iv) as BufferSource },
      key,
      fromBase64(envelope.data) as BufferSource,
    );
    return new Uint8Array(plaintext);
  } catch {
    throw new Error("Wrong password or damaged recovery file");
  }
}
