/**
 * Mainnet token branding is keyed by mint because symbols are not unique on
 * Solana. Each image URL was fetched and checked on 2026-09-12.
 */
export const TOKEN_ICONS = {
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: {
    name: "USD Coin",
    imageUrl: "/tokens/usdc.png",
    source:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json",
  },
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: {
    name: "Tether USD",
    imageUrl: "/tokens/usdt.svg",
    source:
      "https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json",
  },
  CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH: {
    name: "CASH",
    imageUrl: "/tokens/cash.png",
    source: "https://token-metadata.bridge.xyz/solana/cash.json",
  },
} as const;

export type TokenIcon = (typeof TOKEN_ICONS)[keyof typeof TOKEN_ICONS];

export function getTokenIcon(mint: string): TokenIcon | undefined {
  return TOKEN_ICONS[mint as keyof typeof TOKEN_ICONS];
}
