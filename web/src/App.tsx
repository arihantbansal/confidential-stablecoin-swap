import { address, generateKeyPairSigner } from "@solana/kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { AccountDialog, WalletDialog } from "@/components/Account";
import {
  Exchange,
  type ExchangeAction,
  type ExchangeStatus,
} from "@/components/Exchange";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatBaseUnits } from "@/lib/amounts";
import {
  applyPendingBalance,
  type BalanceView,
  convert as convertTokens,
  ensureConfidentialAccount,
  RecipientNotReadyError,
  readBalances,
  readUnwrappedBalance,
  requestFunds,
  send as sendTokens,
  type TxStage,
  unlockSession,
  withdraw as withdrawTokens,
} from "@/lib/engine";
import { type LocalManifest, loadManifest } from "@/lib/manifest";
import { createSession, freeSessionKeys, type Session } from "@/lib/session";
import {
  asKitSigner,
  connectWallet,
  disconnectWallet,
  listWallets,
  onWalletAccountsChange,
  onWalletsChange,
  type Wallet,
} from "@/lib/wallets";

interface TestConnection {
  kind: "test";
  session: Session;
}

interface InjectedConnection {
  kind: "injected";
  wallet: Wallet;
  session: Session;
  stopWatching: () => void;
}

type Connection = TestConnection | InjectedConnection | null;

const EMPTY_BALANCES: BalanceView = {
  public: null,
  pending: null,
  confidential: null,
};

const DONE_MESSAGE: Record<ExchangeAction, (amount: string) => string> = {
  convert: (amount) => `Converted ${amount} Test USD to confidential`,
  send: (amount) => `Sent ${amount} Test USD`,
  withdraw: (amount) => `Converted ${amount} Test USD to public`,
};

export function App() {
  const [manifest, setManifest] = useState<LocalManifest | null>(null);
  const [manifestError, setManifestError] = useState(false);
  const [connection, setConnection] = useState<Connection>(null);
  const [balances, setBalances] = useState<BalanceView>(EMPTY_BALANCES);
  const [unwrapped, setUnwrapped] = useState<bigint | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<ExchangeStatus | null>(null);
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [wallets, setWallets] = useState<readonly Wallet[]>([]);
  const [detail, setDetail] = useState<{
    title: string;
    body: string;
  } | null>(null);
  const connectionRef = useRef<Connection>(null);
  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);

  const load = useCallback(async () => {
    try {
      setManifest(await loadManifest());
      setManifestError(false);
    } catch {
      setManifestError(true);
    }
  }, []);

  useEffect(() => {
    void load();
    setWallets(listWallets());
    return onWalletsChange(() => setWallets(listWallets()));
  }, [load]);

  const refreshBalances = useCallback(async (session: Session) => {
    try {
      const [view, testUsd] = await Promise.all([
        readBalances(session),
        readUnwrappedBalance(session),
      ]);
      if (connectionRef.current?.session !== session) return;
      setBalances(view);
      setUnwrapped(testUsd);
    } catch {
      if (connectionRef.current?.session !== session) return;
      setBalances(EMPTY_BALANCES);
      setUnwrapped(null);
    }
  }, []);

  useEffect(() => {
    if (!connection || busy) return;
    const refresh = () => void refreshBalances(connection.session);
    const interval = window.setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [connection, busy, refreshBalances]);

  function trackProgress(stage: TxStage, message: string): void {
    const label =
      stage === "awaiting-approval"
        ? connectionRef.current?.kind === "injected"
          ? "Approve in your wallet"
          : "Submitting"
        : stage === "preparing-account"
          ? "Setting up wallet"
          : stage === "preparing-proof"
            ? "Preparing transaction"
            : stage === "confirmed"
              ? "Finishing"
              : message;
    setStatus({ state: "working", message: label });
  }

  const notifySuccess = useCallback(
    (message: string, detailValue?: string): void => {
      toast.success(message, {
        action: detailValue ? (
          <a
            href={`https://explorer.solana.com/tx/${detailValue}?${new URLSearchParams({ cluster: "custom", customUrl: "http://127.0.0.1:8899" })}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex min-h-11 shrink-0 items-center rounded-md px-3 text-xs font-medium underline underline-offset-4"
          >
            View transaction
          </a>
        ) : undefined,
      });
    },
    [],
  );

  const notifyError = useCallback(
    (
      message: string,
      options?: { detail?: string; nextStep?: string },
    ): void => {
      toast.error(message, {
        duration: 10000,
        description: options?.nextStep,
        action: options?.detail
          ? {
              label: "Details",
              onClick: () =>
                setDetail({ title: message, body: options.detail ?? "" }),
            }
          : undefined,
      });
    },
    [],
  );

  const disconnect = useCallback(() => {
    const current = connectionRef.current;
    if (current?.kind === "injected") {
      current.stopWatching();
      void disconnectWallet(current.wallet).catch(() => {
        notifyError("Wallet disconnect failed.", {
          nextStep: "Try disconnecting again.",
        });
      });
    }
    if (current) {
      freeSessionKeys(current.session);
    }
    setConnection(null);
    setAccountOpen(false);
    setBalances(EMPTY_BALANCES);
    setUnwrapped(null);
    setStatus(null);
  }, [notifyError]);

  async function attachSession(session: Session): Promise<void> {
    try {
      await unlockSession(session);
    } catch (error) {
      notifyError("Connected without confidential keys.", {
        detail:
          error instanceof Error ? error.message : "Key derivation failed.",
        nextStep: "Reconnect to try again.",
      });
    }
    await refreshBalances(session);
  }

  async function startTestWallet(): Promise<void> {
    if (!manifest || busy) {
      return;
    }
    setBusy(true);
    try {
      const signer = await generateKeyPairSigner();
      const session = createSession(manifest, signer, signer.address);
      setConnection({ kind: "test", session });
      setWalletDialogOpen(false);
      setStatus({ state: "working", message: "Funding test wallet" });
      await requestFunds(signer.address.toString());
      await unlockSession(session);
      await ensureConfidentialAccount(session, trackProgress);
      await refreshBalances(session);
      setStatus(null);
    } catch (error) {
      setStatus(null);
      notifyError("Could not create the test wallet.", {
        detail: error instanceof Error ? error.message : undefined,
        nextStep: "Check the local network and try again.",
      });
      if (connectionRef.current) {
        freeSessionKeys(connectionRef.current.session);
        setConnection(null);
      }
    } finally {
      setBusy(false);
    }
  }

  async function pickWallet(wallet: Wallet): Promise<void> {
    if (!manifest || busy) {
      return;
    }
    setBusy(true);
    try {
      const account = await connectWallet(wallet);
      const session = createSession(
        manifest,
        asKitSigner(wallet, account),
        address(account.address),
      );
      const stopWatching = onWalletAccountsChange(wallet, (accounts) => {
        const current = connectionRef.current;
        if (current?.kind !== "injected" || current.wallet !== wallet) {
          return;
        }
        const next = accounts.find((candidate) =>
          candidate.chains.some((chain) => chain.startsWith("solana:")),
        );
        if (!next || next.address !== account.address) {
          disconnect();
          notifyError("Wallet account changed.", {
            nextStep: "Reconnect with the expected account.",
          });
        }
      });
      setConnection({ kind: "injected", wallet, session, stopWatching });
      setWalletDialogOpen(false);
      await attachSession(session);
    } catch (error) {
      notifyError("Wallet connection failed.", {
        detail: error instanceof Error ? error.message : undefined,
        nextStep: "Try again or use a local test wallet.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function submit(
    action: ExchangeAction,
    amount: bigint,
    recipient: string,
  ): Promise<void> {
    if (!connection || busy) {
      return;
    }
    const { session } = connection;
    setStatus({ state: "working", message: "Preparing transaction" });
    setBusy(true);
    try {
      let signatures: string[];
      if (action === "convert") {
        signatures = await convertTokens(session, amount, trackProgress);
      } else if (action === "send") {
        signatures = await sendTokens(
          session,
          recipient,
          amount,
          trackProgress,
        );
      } else {
        const result = await withdrawTokens(session, amount, trackProgress);
        signatures = result.signatures;
      }
      const message = DONE_MESSAGE[action](formatBaseUnits(amount));
      const signature = signatures.at(-1);
      setStatus({
        state: "done",
        message,
      });
      notifySuccess(message, signature);
      await refreshBalances(session);
    } catch (error) {
      await refreshBalances(session);
      setStatus(null);
      if (error instanceof RecipientNotReadyError) {
        notifyError(error.message, {
          nextStep: "Ask the recipient to set up, then try again.",
        });
      } else {
        notifyError("Could not complete the transaction.", {
          detail: error instanceof Error ? error.message : undefined,
          nextStep: "Check updated balances before trying again.",
        });
      }
    } finally {
      setBusy(false);
    }
  }

  async function applyPending(): Promise<void> {
    if (!connection || busy) {
      return;
    }
    setBusy(true);
    try {
      const signature = await applyPendingBalance(
        connection.session,
        trackProgress,
      );
      if (signature) {
        setStatus({
          state: "done",
          message: "Payment accepted",
        });
        notifySuccess("Payment accepted", signature);
      } else {
        setStatus(null);
      }
      await refreshBalances(connection.session);
    } catch (error) {
      await refreshBalances(connection.session);
      setStatus(null);
      notifyError("Could not apply pending balance.", {
        detail: error instanceof Error ? error.message : undefined,
        nextStep: "Try again after balances refresh.",
      });
    } finally {
      setBusy(false);
    }
  }

  async function funds(): Promise<void> {
    if (!connection || busy) {
      return;
    }
    setBusy(true);
    try {
      await requestFunds(connection.session.owner.toString());
      await ensureConfidentialAccount(connection.session, trackProgress);
      setStatus(null);
      notifySuccess("Test dollars added.");
      await refreshBalances(connection.session);
    } catch (error) {
      setStatus(null);
      notifyError("Funding failed.", {
        detail: error instanceof Error ? error.message : undefined,
        nextStep: "Check the local network and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  const connectedAddress = connection?.session.owner.toString() ?? null;

  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-[452px] items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm font-semibold tracking-tight">
            Confidential Dollars
          </p>
          {connection ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAccountOpen(true)}
              aria-label="Open wallet account"
              className="press min-h-11 font-mono text-xs"
            >
              {connectedAddress?.slice(0, 4)}…{connectedAddress?.slice(-4)}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setWalletDialogOpen(true)}
              className="press min-h-11"
            >
              Connect wallet
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-[452px] space-y-3 px-4 py-6">
        {manifestError ? (
          <p className="rounded-xl border px-5 py-4 text-sm">
            Local network unavailable.{" "}
            <button
              type="button"
              onClick={() => void load()}
              className="font-medium underline underline-offset-4"
            >
              Retry
            </button>
          </p>
        ) : null}

        <Exchange
          connected={connection !== null}
          balances={balances}
          unwrapped={unwrapped}
          busy={busy}
          status={status}
          onActionChange={() => setStatus(null)}
          onConnect={() => setWalletDialogOpen(true)}
          onApplyPending={() => void applyPending()}
          onSubmit={(action, amount, recipient) => {
            void submit(action, amount, recipient);
          }}
        />

        {connection ? (
          <AccountDialog
            publicBalance={unwrapped}
            confidentialBalance={balances.confidential}
            open={accountOpen}
            onOpenChange={setAccountOpen}
            address={connectedAddress ?? ""}
            busy={busy}
            onFunds={() => void funds()}
            onDisconnect={disconnect}
          />
        ) : null}
      </main>

      <WalletDialog
        open={walletDialogOpen}
        onOpenChange={setWalletDialogOpen}
        wallets={wallets}
        busy={busy}
        onPickWallet={(wallet) => void pickWallet(wallet)}
        onNewTestWallet={() => void startTestWallet()}
      />

      <Toaster
        position="bottom-center"
        duration={6000}
        closeButton
        toastOptions={{
          style: {
            background: "var(--popover)",
            color: "var(--popover-foreground)",
            border: "1px solid var(--border)",
          },
        }}
      />

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.title ?? "Details"}</DialogTitle>
            <DialogDescription>Transaction detail.</DialogDescription>
          </DialogHeader>
          <p className="break-all font-mono text-xs text-muted-foreground">
            {detail?.body}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
