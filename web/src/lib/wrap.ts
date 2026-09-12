import {
  AccountRole,
  type Address,
  getAddressEncoder,
  getProgramDerivedAddress,
  getStructEncoder,
  getU8Encoder,
  getU64Encoder,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";

const SEED_AUTHORITY = new TextEncoder().encode("authority");

function addressBytes(addr: Address): Uint8Array {
  return Uint8Array.from(getAddressEncoder().encode(addr));
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
    data: Uint8Array.from(data),
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
      { address: accounts.recipientUnwrappedToken, role: AccountRole.WRITABLE },
      { address: accounts.wrappedMintAuthority, role: AccountRole.READONLY },
      { address: accounts.unwrappedMint, role: AccountRole.READONLY },
      { address: accounts.wrappedTokenProgram, role: AccountRole.READONLY },
      { address: accounts.unwrappedTokenProgram, role: AccountRole.READONLY },
      { address: accounts.wrappedTokenAccount, role: AccountRole.WRITABLE },
      { address: accounts.wrappedMint, role: AccountRole.WRITABLE },
      signerOrReadonly(accounts.transferAuthority),
    ],
    data: Uint8Array.from(data),
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
