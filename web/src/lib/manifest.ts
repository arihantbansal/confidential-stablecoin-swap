import { type Address, address } from "@solana/kit";

export interface LocalManifest {
  rpcHttpUrl: string;
  rpcWsUrl: string;
  wrapperProgram: Address;
  assets: LocalAsset[];
}

export interface LocalAsset {
  symbol: "USDC" | "USDT" | "CASH";
  mint: Address;
  decimals: number;
  tokenProgram: Address;
  wrapped: {
    mint: Address;
    escrow: Address;
    mintAuthority: Address;
  };
}

export async function loadManifest(): Promise<LocalManifest> {
  const response = await fetch("/local.json", {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("Run local setup first.");
  const manifest = (await response.json()) as LocalManifest;
  if (
    manifest.rpcHttpUrl !== "http://127.0.0.1:8899" ||
    manifest.rpcWsUrl !== "ws://127.0.0.1:8900"
  ) {
    throw new Error("Expected the local Surfpool deployment.");
  }
  if (!manifest.assets?.length) {
    throw new Error("The local deployment has no assets.");
  }
  return {
    ...manifest,
    wrapperProgram: address(manifest.wrapperProgram),
    assets: manifest.assets.map((asset) => ({
      ...asset,
      mint: address(asset.mint),
      tokenProgram: address(asset.tokenProgram),
      wrapped: {
        mint: address(asset.wrapped.mint),
        escrow: address(asset.wrapped.escrow),
        mintAuthority: address(asset.wrapped.mintAuthority),
      },
    })),
  };
}
