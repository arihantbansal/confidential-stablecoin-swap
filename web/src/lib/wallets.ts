import {
  type Address,
  getTransactionDecoder,
  getTransactionEncoder,
  type SignableMessage,
  type SignatureBytes,
  type SignatureDictionary,
  type Transaction,
  type TransactionWithinSizeLimit,
  type TransactionWithLifetime,
} from "@solana/kit";
import {
  SolanaSignMessage,
  type SolanaSignMessageFeature,
  SolanaSignTransaction,
  type SolanaSignTransactionFeature,
} from "@solana/wallet-standard-features";
import { getWallets } from "@wallet-standard/app";
import type {
  IdentifierString,
  Wallet,
  WalletAccount,
  WalletWithFeatures,
} from "@wallet-standard/base";
import {
  StandardConnect,
  type StandardConnectFeature,
  StandardDisconnect,
  type StandardDisconnectFeature,
  StandardEvents,
  type StandardEventsFeature,
} from "@wallet-standard/features";
import type { FullSigner } from "@/lib/session";

export type { Wallet, WalletAccount };

const LOCAL_CHAIN: IdentifierString = "solana:localnet";

export function listWallets(): readonly Wallet[] {
  return getWallets().get();
}

export function onWalletsChange(listener: () => void): () => void {
  const wallets = getWallets();
  const offRegister = wallets.on("register", listener);
  const offUnregister = wallets.on("unregister", listener);
  return () => {
    offRegister();
    offUnregister();
  };
}

export function onWalletAccountsChange(
  wallet: Wallet,
  listener: (accounts: readonly WalletAccount[]) => void,
): () => void {
  const events = (wallet as WalletWithFeatures<StandardEventsFeature>).features[
    StandardEvents
  ];
  if (!events || !("on" in events)) {
    return () => undefined;
  }
  return events.on("change", (properties) => {
    if (properties.accounts) {
      listener(properties.accounts);
    }
  });
}

export function solanaAccounts(wallet: Wallet): readonly WalletAccount[] {
  return wallet.accounts.filter((account) =>
    account.chains.some((chain) => chain.startsWith("solana:")),
  );
}

function connectFeature(wallet: Wallet) {
  if (!(StandardConnect in wallet.features)) {
    throw new Error("Wallet does not support standard:connect");
  }
  return (wallet as WalletWithFeatures<StandardConnectFeature>).features[
    StandardConnect
  ];
}

function disconnectFeature(wallet: Wallet) {
  if (!(StandardDisconnect in wallet.features)) {
    return undefined;
  }
  return (wallet as WalletWithFeatures<StandardDisconnectFeature>).features[
    StandardDisconnect
  ];
}

function signMessageFeature(wallet: Wallet) {
  if (!(SolanaSignMessage in wallet.features)) {
    throw new Error("Wallet does not support solana:signMessage");
  }
  return (wallet as WalletWithFeatures<SolanaSignMessageFeature>).features[
    SolanaSignMessage
  ];
}

function signTransactionFeature(wallet: Wallet) {
  if (!(SolanaSignTransaction in wallet.features)) {
    throw new Error("Wallet does not support solana:signTransaction");
  }
  return (wallet as WalletWithFeatures<SolanaSignTransactionFeature>).features[
    SolanaSignTransaction
  ];
}

export async function connectWallet(wallet: Wallet): Promise<WalletAccount> {
  const { accounts } = await connectFeature(wallet).connect();
  const account =
    accounts.find((candidate) =>
      candidate.chains.some((chain) => chain.startsWith("solana:")),
    ) ?? accounts[0];
  if (!account) {
    throw new Error("Wallet returned no accounts");
  }
  return account;
}

export async function disconnectWallet(wallet: Wallet): Promise<void> {
  await disconnectFeature(wallet)?.disconnect();
}

export function asKitSigner(
  wallet: Wallet,
  account: WalletAccount,
): FullSigner {
  const address = account.address as Address;
  return {
    address,
    async signMessages(
      messages: readonly SignableMessage[],
    ): Promise<readonly SignatureDictionary[]> {
      const feature = signMessageFeature(wallet);
      return Promise.all(
        messages.map(async (message) => {
          const [output] = await feature.signMessage({
            message: Uint8Array.from(message.content),
            account,
          });
          if (!output) {
            throw new Error("Wallet returned no signature");
          }
          return {
            [address]: output.signature as SignatureBytes,
          } as SignatureDictionary;
        }),
      );
    },
    async signTransactions(
      transactions: readonly (Transaction &
        TransactionWithinSizeLimit &
        TransactionWithLifetime)[],
    ): Promise<readonly SignatureDictionary[]> {
      const feature = signTransactionFeature(wallet);
      return Promise.all(
        transactions.map(async (transaction) => {
          const bytes = Uint8Array.from(
            getTransactionEncoder().encode(transaction),
          );
          const [output] = await feature.signTransaction({
            transaction: bytes,
            account,
            chain: LOCAL_CHAIN,
          });
          if (!output) {
            throw new Error("Wallet returned no signed transaction");
          }
          const decoded = getTransactionDecoder().decode(
            output.signedTransaction,
          );
          const signature = decoded.signatures[address];
          if (!signature) {
            throw new Error("Wallet signature missing from signed transaction");
          }
          return { [address]: signature } as SignatureDictionary;
        }),
      );
    },
  };
}
