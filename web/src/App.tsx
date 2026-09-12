import { address, type KeyPairSigner } from "@solana/kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import { AccountSection, WalletDialog } from "@/components/Account";
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
import {
  createTestWallet,
  decryptRecoveryFile,
  encryptRecoveryFile,
  exportSecretBytes,
  importTestWallet,
} from "@/lib/keys";
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
  signer: KeyPairSigner;
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
  convert: (amount) => `Converted ${amount} Test USD`,
  send: (amount) => `Sent ${amount} Wrapped Test USD`,
  withdraw: (amount) => `Withdrew ${amount} Test USD`,
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
  const [wallets, setWallets] = useState<readonly Wallet[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
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
        action: detailValue
          ? {
              label: "Details",
              onClick: () => setDetail({ title: message, body: detailValue }),
            }
          : undefined,
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
    setImportError(null);
    try {
      const signer = await createTestWallet();
      const session = createSession(manifest, signer, signer.address);
      setConnection({ kind: "test", signer, session });
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

  async function importRecovery(text: string, password: string): Promise<void> {
    if (!manifest || busy) {
      return;
    }
    setBusy(true);
    setImportError(null);
    let secret: Uint8Array | null = null;
    try {
      secret = await decryptRecoveryFile(text, password);
      const signer = await importTestWallet(secret);
      const session = createSession(manifest, signer, signer.address);
      setConnection({ kind: "test", signer, session });
      setWalletDialogOpen(false);
      await attachSession(session);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed.");
    } finally {
      secret?.fill(0);
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
        detail: signature,
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
          detail: signature,
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

  async function exportRecovery(password: string): Promise<void> {
    if (connection?.kind !== "test" || busy) {
      return;
    }
    setBusy(true);
    let secret: Uint8Array | null = null;
    try {
      secret = await exportSecretBytes(connection.signer);
      const text = await encryptRecoveryFile(secret, password);
      const blob = new Blob([text], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "test-wallet-recovery.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      notifySuccess("Recovery file download started.");
    } catch (error) {
      notifyError("Export failed.", {
        detail: error instanceof Error ? error.message : undefined,
        nextStep: "Try again with a valid password.",
      });
    } finally {
      secret?.fill(0);
      setBusy(false);
    }
  }

  const connectedAddress = connection?.session.owner.toString() ?? null;

  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-sm items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm font-semibold tracking-tight">
            Confidential Dollars
          </p>
          {connection ? (
            <p className="max-w-28 truncate font-mono text-xs text-muted-foreground">
              {connectedAddress}
            </p>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setWalletDialogOpen(true)}
              className="press min-h-11"
            >
              Connect
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-sm space-y-3 px-4 py-6">
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
          onCreateWallet={() => void startTestWallet()}
          onApplyPending={() => void applyPending()}
          onSubmit={(action, amount, recipient) => {
            void submit(action, amount, recipient);
          }}
        />

        {connection ? (
          <AccountSection
            address={connectedAddress ?? ""}
            isTestWallet={connection.kind === "test"}
            busy={busy}
            onFunds={() => void funds()}
            onExport={(password) => void exportRecovery(password)}
            onDisconnect={disconnect}
          />
        ) : null}

        <footer className="pt-1 text-center text-xs text-muted-foreground">
          Local test tokens · no value
        </footer>
      </main>

      <WalletDialog
        open={walletDialogOpen}
        onOpenChange={setWalletDialogOpen}
        wallets={wallets}
        busy={busy}
        importError={importError}
        onPickWallet={(wallet) => void pickWallet(wallet)}
        onNewTestWallet={() => void startTestWallet()}
        onImport={(text, password) => void importRecovery(text, password)}
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
