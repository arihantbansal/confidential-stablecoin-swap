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
  const manifest: LocalManifest = await response.json();
  if (
    manifest.rpcHttpUrl !== "http://127.0.0.1:8899" ||
    manifest.rpcWsUrl !== "ws://127.0.0.1:8900"
  )
    throw new Error("Expected the local Surfpool deployment.");
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0)
    throw new Error("The local deployment has no assets.");
  const assets = manifest.assets.map((asset) => {
    if (
      !["USDC", "USDT", "CASH"].includes(asset.symbol) ||
      !Number.isInteger(asset.decimals) ||
      asset.decimals < 0 ||
      asset.decimals > 255
    )
      throw new Error("Invalid local asset metadata.");
    return {
      ...asset,
      mint: address(asset.mint),
      tokenProgram: address(asset.tokenProgram),
      wrapped: {
        mint: address(asset.wrapped.mint),
        escrow: address(asset.wrapped.escrow),
        mintAuthority: address(asset.wrapped.mintAuthority),
      },
    };
  });
  return {
    ...manifest,
    wrapperProgram: address(manifest.wrapperProgram),
    assets,
  };
}
