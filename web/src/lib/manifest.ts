import { type Address, address } from "@solana/kit";

export interface LocalManifest {
  rpcHttpUrl: string;
  rpcWsUrl: string;
  wrapperProgram: Address;
  testUsd: { mint: Address; decimals: number };
  wrapped: { mint: Address; escrow: Address; mintAuthority: Address };
}

export async function loadManifest(): Promise<LocalManifest> {
  const response = await fetch("/local.json", { cache: "no-store" });
  if (!response.ok) throw new Error("Run local setup first.");
  const manifest: LocalManifest = await response.json();
  if (
    manifest.rpcHttpUrl !== "http://127.0.0.1:8899" ||
    manifest.rpcWsUrl !== "ws://127.0.0.1:8900" ||
    manifest.testUsd.decimals !== 6
  ) {
    throw new Error("Expected the local Test USD deployment.");
  }
  return {
    ...manifest,
    wrapperProgram: address(manifest.wrapperProgram),
    testUsd: { mint: address(manifest.testUsd.mint), decimals: 6 },
    wrapped: {
      mint: address(manifest.wrapped.mint),
      escrow: address(manifest.wrapped.escrow),
      mintAuthority: address(manifest.wrapped.mintAuthority),
    },
  };
}
