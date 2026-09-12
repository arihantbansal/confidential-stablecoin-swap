const LOCAL_RPC_URL = "http://127.0.0.1:8899";

export function transactionUrl(signature: string): string {
  const query = new URLSearchParams({
    cluster: "custom",
    customUrl: LOCAL_RPC_URL,
  });
  return `https://explorer.solana.com/tx/${signature}?${query}`;
}
