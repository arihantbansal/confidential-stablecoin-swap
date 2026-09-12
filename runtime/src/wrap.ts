import {
  AccountRole,
  type Address,
  getAddressEncoder,
  getBooleanEncoder,
  getProgramDerivedAddress,
  getStructEncoder,
  getU8Encoder,
  getU64Encoder,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import { SYSTEM_PROGRAM_ADDRESS } from "@solana-program/system";

// Layouts mirror vendor/token-wrap/idl.json (createMint = 0, wrap = 1,
// unwrap = 2). The published client ships without its build output, so these
// encode the same bytes with the program address supplied explicitly.

const SEED_MINT = new TextEncoder().encode("mint");
const SEED_AUTHORITY = new TextEncoder().encode("authority");
const SEED_BACKPOINTER = new TextEncoder().encode("backpointer");

function addressBytes(addr: Address): Uint8Array {
  return new Uint8Array(getAddressEncoder().encode(addr));
}

export async function findWrappedMintPda(
  wrapperProgram: Address,
  unwrappedMint: Address,
  wrappedTokenProgram: Address,
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: wrapperProgram,
    seeds: [
      SEED_MINT,
      addressBytes(unwrappedMint),
      addressBytes(wrappedTokenProgram),
    ],
  });
  return pda;
}

export async function findWrappedMintAuthorityPda(
  wrapperProgram: Address,
  wrappedMint: Address,
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: wrapperProgram,
    seeds: [SEED_AUTHORITY, addressBytes(wrappedMint)],
  });
  return pda;
}

export async function findBackpointerPda(
  wrapperProgram: Address,
  wrappedMint: Address,
): Promise<Address> {
  const [pda] = await getProgramDerivedAddress({
    programAddress: wrapperProgram,
    seeds: [SEED_BACKPOINTER, addressBytes(wrappedMint)],
  });
  return pda;
}

export interface CreateMintAccounts {
  wrappedMint: Address;
  backpointer: Address;
  unwrappedMint: Address;
  wrappedTokenProgram: Address;
}

export function getCreateMintInstruction(
  wrapperProgram: Address,
  accounts: CreateMintAccounts,
  idempotent = false,
): Instruction {
  const data = getStructEncoder([
    ["discriminator", getU8Encoder()],
    ["idempotent", getBooleanEncoder()],
  ]).encode({ discriminator: 0, idempotent });
  return {
    programAddress: wrapperProgram,
    accounts: [
      { address: accounts.wrappedMint, role: AccountRole.WRITABLE },
      { address: accounts.backpointer, role: AccountRole.WRITABLE },
      { address: accounts.unwrappedMint, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ADDRESS, role: AccountRole.READONLY },
      { address: accounts.wrappedTokenProgram, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(data),
  };
}

export interface WrapAccounts {
  recipientWrappedTokenAccount: Address;
  wrappedMint: Address;
  wrappedMintAuthority: Address;
  unwrappedTokenProgram: Address;
  wrappedTokenProgram: Address;
  unwrappedTokenAccount: Address;
  unwrappedMint: Address;
  unwrappedEscrow: Address;
  transferAuthority: Address | TransactionSigner;
}

export function getWrapInstruction(
  wrapperProgram: Address,
  accounts: WrapAccounts,
  amount: bigint,
): Instruction {
  const data = getStructEncoder([
    ["discriminator", getU8Encoder()],
    ["amount", getU64Encoder()],
  ]).encode({ discriminator: 1, amount });
  return {
    programAddress: wrapperProgram,
    accounts: [
      {
        address: accounts.recipientWrappedTokenAccount,
        role: AccountRole.WRITABLE,
      },
      { address: accounts.wrappedMint, role: AccountRole.WRITABLE },
      { address: accounts.wrappedMintAuthority, role: AccountRole.READONLY },
      { address: accounts.unwrappedTokenProgram, role: AccountRole.READONLY },
      { address: accounts.wrappedTokenProgram, role: AccountRole.READONLY },
      { address: accounts.unwrappedTokenAccount, role: AccountRole.WRITABLE },
      { address: accounts.unwrappedMint, role: AccountRole.READONLY },
      { address: accounts.unwrappedEscrow, role: AccountRole.WRITABLE },
      signerOrReadonly(accounts.transferAuthority),
    ],
    data: new Uint8Array(data),
  };
}

export interface UnwrapAccounts {
  unwrappedEscrow: Address;
  recipientUnwrappedToken: Address;
  wrappedMintAuthority: Address;
  unwrappedMint: Address;
  wrappedTokenProgram: Address;
  unwrappedTokenProgram: Address;
  wrappedTokenAccount: Address;
  wrappedMint: Address;
  transferAuthority: Address | TransactionSigner;
}

export function getUnwrapInstruction(
  wrapperProgram: Address,
  accounts: UnwrapAccounts,
  amount: bigint,
): Instruction {
  const data = getStructEncoder([
    ["discriminator", getU8Encoder()],
    ["amount", getU64Encoder()],
  ]).encode({ discriminator: 2, amount });
  return {
    programAddress: wrapperProgram,
    accounts: [
      { address: accounts.unwrappedEscrow, role: AccountRole.WRITABLE },
      {
        address: accounts.recipientUnwrappedToken,
        role: AccountRole.WRITABLE,
      },
      { address: accounts.wrappedMintAuthority, role: AccountRole.READONLY },
      { address: accounts.unwrappedMint, role: AccountRole.READONLY },
      { address: accounts.wrappedTokenProgram, role: AccountRole.READONLY },
      { address: accounts.unwrappedTokenProgram, role: AccountRole.READONLY },
      { address: accounts.wrappedTokenAccount, role: AccountRole.WRITABLE },
      { address: accounts.wrappedMint, role: AccountRole.WRITABLE },
      signerOrReadonly(accounts.transferAuthority),
    ],
    data: new Uint8Array(data),
  };
}

function signerOrReadonly(authority: Address | TransactionSigner) {
  if (typeof authority === "string") {
    return { address: authority, role: AccountRole.READONLY };
  }
  return {
    address: authority.address,
    role: AccountRole.READONLY_SIGNER,
    signer: authority,
  };
}
