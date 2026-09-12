import type { Address, Instruction } from "@solana/kit";
import { WRAPPER_PROGRAM_ADDRESS } from "#runtime/config";
import {
  type CreateMintAccounts,
  findBackpointerPda as findBackpointerForProgram,
  findWrappedMintAuthorityPda as findWrappedMintAuthorityForProgram,
  findWrappedMintPda as findWrappedMintForProgram,
  getCreateMintInstruction as getCreateMintForProgram,
  getUnwrapInstruction as getUnwrapForProgram,
  getWrapInstruction as getWrapForProgram,
  type UnwrapAccounts,
  type WrapAccounts,
} from "#runtime/wrap";

export type { CreateMintAccounts, UnwrapAccounts, WrapAccounts };

/** Config-bound wrappers over #runtime/wrap for the deployment program. */

export function findWrappedMintPda(
  unwrappedMint: Address,
  wrappedTokenProgram: Address,
): Promise<Address> {
  return findWrappedMintForProgram(
    WRAPPER_PROGRAM_ADDRESS,
    unwrappedMint,
    wrappedTokenProgram,
  );
}

export function findWrappedMintAuthorityPda(
  wrappedMint: Address,
): Promise<Address> {
  return findWrappedMintAuthorityForProgram(
    WRAPPER_PROGRAM_ADDRESS,
    wrappedMint,
  );
}

export function findBackpointerPda(wrappedMint: Address): Promise<Address> {
  return findBackpointerForProgram(WRAPPER_PROGRAM_ADDRESS, wrappedMint);
}

export function getCreateMintInstruction(
  accounts: CreateMintAccounts,
  idempotent = false,
): Instruction {
  return getCreateMintForProgram(WRAPPER_PROGRAM_ADDRESS, accounts, idempotent);
}

export function getWrapInstruction(
  accounts: WrapAccounts,
  amount: bigint,
): Instruction {
  return getWrapForProgram(WRAPPER_PROGRAM_ADDRESS, accounts, amount);
}

export function getUnwrapInstruction(
  accounts: UnwrapAccounts,
  amount: bigint,
): Instruction {
  return getUnwrapForProgram(WRAPPER_PROGRAM_ADDRESS, accounts, amount);
}
