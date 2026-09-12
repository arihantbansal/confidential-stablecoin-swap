import {
  address,
  generateKeyPairSigner,
  signature as parseSignature,
} from "@solana/kit";
import { toast } from "sonner";
import { formatBaseUnits } from "@/lib/amounts";
import type { BalanceView, Progress } from "@/lib/engine";
import {
  type LocalAsset,
  type LocalManifest,
  loadManifest,
} from "@/lib/manifest";
import type { Session } from "@/lib/session";
import {
  asKitSigner,
  connectWallet,
  disconnectWallet,
  listWallets,
  onWalletAccountsChange,
  onWalletsChange,
  type Wallet,
} from "@/lib/wallets";

export type BalanceState = "loading" | "ready" | "locked" | "error";
export type ExchangeAction = "convert" | "send" | "withdraw";
interface Connection {
  kind: "test" | "injected";
  session: Session;
  sessions: Map<string, Session>;
  wallet?: Wallet;
  stopWatching?: () => void;
}
export interface OperationResult {
  message: string;
  confirmed: string[];
  unresolved: string[];
  failed: string[];
}
export interface ApplicationState {
  manifest: LocalManifest | null;
  manifestError: string | null;
  connection: Connection | null;
  selectedAsset: LocalAsset | null;
  balances: BalanceView;
  unwrapped: bigint | null;
  balanceState: BalanceState;
  incomingTransfers: { asset: LocalAsset; amount: bigint | null }[];
  applyingMint: string | null;
  busy: boolean;
  status: { state: "working" | "done"; message: string } | null;
  result: OperationResult | null;
  wallets: readonly Wallet[];
  walletDialogOpen: boolean;
  accountOpen: boolean;
  detail: { title: string; body: string } | null;
}
const EMPTY_BALANCES: BalanceView = {
  public: null,
  confidential: null,
  pending: null,
};
const engine = () => import("@/lib/engine");
const sessionTools = () => import("@/lib/session");

/** State changes happen in events; React only subscribes to immutable snapshots. */
export function createApplication() {
  let state: ApplicationState = {
    manifest: null,
    manifestError: null,
    connection: null,
    selectedAsset: null,
    balances: EMPTY_BALANCES,
    unwrapped: null,
    balanceState: "loading",
    incomingTransfers: [],
    applyingMint: null,
    busy: false,
    status: null,
    result: null,
    wallets: [],
    walletDialogOpen: false,
    accountOpen: false,
    detail: null,
  };
  const listeners = new Set<() => void>();
  let generation = 0;
  let active = false;
  let operationPending = false;
  let unresolvedRpc: Session["client"]["rpc"] | null = null;
  let refreshPromise: Promise<void> | null = null;
  let manifestRequest = 0;
  const patch = (next: Partial<ApplicationState>) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };
  const sameConnection = (connection: Connection) =>
    active && state.connection?.sessions === connection.sessions;
  const notifyError = (message: string, error?: unknown, nextStep?: string) => {
    toast.error(message, {
      duration: Infinity,
      description: nextStep,
      action:
        error instanceof Error
          ? {
              label: "Details",
              onClick: () =>
                patch({ detail: { title: message, body: error.message } }),
            }
          : undefined,
    });
  };
  const dispose = (connection: Connection | null) => {
    connection?.stopWatching?.();
    if (connection)
      void sessionTools().then(({ freeSessionKeys }) => {
        for (const session of connection.sessions.values())
          freeSessionKeys(session);
      });
  };
  function disconnect() {
    generation++;
    const previous = state.connection;
    dispose(previous);
    refreshPromise = null;
    patch({
      connection: null,
      accountOpen: false,
      balances: EMPTY_BALANCES,
      unwrapped: null,
      incomingTransfers: [],
      applyingMint: null,
      busy: operationPending,
      status: null,
      result: unresolvedRpc ? state.result : null,
      balanceState: "loading",
    });
    if (previous?.wallet)
      void disconnectWallet(previous.wallet).catch((error) =>
        notifyError(
          "Wallet disconnect failed.",
          error,
          "Disconnect from your wallet extension.",
        ),
      );
  }
  async function load() {
    const request = ++manifestRequest;
    try {
      const manifest = await loadManifest();
      if (!active || request !== manifestRequest) return;
      patch({
        manifest,
        manifestError: null,
        selectedAsset:
          manifest.assets.find(
            (asset) => asset.mint === state.selectedAsset?.mint,
          ) ?? manifest.assets[0],
      });
    } catch (error) {
      if (active && request === manifestRequest)
        patch({
          manifestError:
            error instanceof Error
              ? error.message
              : "Local deployment unavailable.",
        });
    }
  }
  async function refresh(force = false): Promise<void> {
    const connection = state.connection;
    if (!connection) return;
    if (refreshPromise) {
      if (!force) return refreshPromise;
      await refreshPromise;
      if (!sameConnection(connection)) return;
    }
    const selected = connection.session;
    const run = (async () => {
      const api = await engine();
      const [publicResult, ...assetResults] = await Promise.allSettled([
        api.readUnwrappedBalance(selected),
        ...Array.from(connection.sessions.values()).map((session) =>
          api.readBalances(session),
        ),
      ]);
      if (!sameConnection(connection) || state.connection?.session !== selected)
        return;
      const sessions = Array.from(connection.sessions.values());
      const selectedResult = assetResults[sessions.indexOf(selected)];
      const balances =
        selectedResult?.status === "fulfilled"
          ? (selectedResult.value as BalanceView)
          : EMPTY_BALANCES;
      const unwrapped =
        publicResult.status === "fulfilled"
          ? (publicResult.value as bigint | null)
          : null;
      const incoming = new Map(
        state.incomingTransfers.map((item) => [item.asset.mint, item]),
      );
      assetResults.forEach((result, index) => {
        if (result.status !== "fulfilled") return;
        const session = sessions[index];
        const view = result.value as BalanceView;
        if (view.pending === 0n) incoming.delete(session.selectedAsset.mint);
        else if (view.pending !== null)
          incoming.set(session.selectedAsset.mint, {
            asset: session.selectedAsset,
            amount: view.pending,
          });
        else if (view.hasPending)
          incoming.set(session.selectedAsset.mint, {
            asset: session.selectedAsset,
            amount: null,
          });
        else incoming.delete(session.selectedAsset.mint);
      });
      patch({
        balances,
        unwrapped,
        incomingTransfers: Array.from(incoming.values()),
        balanceState:
          publicResult.status === "rejected" ||
          selectedResult?.status !== "fulfilled"
            ? "error"
            : selected.keys
              ? "ready"
              : "locked",
      });
    })();
    refreshPromise = run;
    try {
      await run;
    } catch {
      if (sameConnection(connection) && state.connection?.session === selected)
        patch({
          balanceState: "error",
          balances: EMPTY_BALANCES,
          unwrapped: null,
        });
    } finally {
      if (refreshPromise === run) refreshPromise = null;
    }
  }
  const begin = (message: string) => {
    if (state.busy || operationPending || unresolvedRpc) return null;
    const id = ++generation;
    patch({ busy: true, status: { state: "working", message } });
    return id;
  };
  const current = (id: number) => active && generation === id;
  const progress =
    (id: number, confirmed: string[]): Progress =>
    (stage, message, signature) => {
      if (signature && !confirmed.includes(signature))
        confirmed.push(signature);
      if (!current(id)) return;
      patch({
        status: {
          state: "working",
          message:
            stage === "awaiting-approval" &&
            state.connection?.kind === "injected"
              ? "Approve in your wallet"
              : message,
        },
      });
    };
  async function makeConnection(
    signer: Session["signer"],
    owner: Session["owner"],
    kind: Connection["kind"],
    wallet?: Wallet,
  ): Promise<Connection> {
    const manifest = state.manifest;
    if (!manifest) throw new Error("Load the local deployment first.");
    const { createSession } = await sessionTools();
    const sessions = new Map(
      manifest.assets.map((asset) => [
        asset.mint.toString(),
        createSession(manifest, signer, owner, asset),
      ]),
    );
    const session = sessions.get(
      (state.selectedAsset ?? manifest.assets[0]).mint,
    );
    if (!session) throw new Error("Selected asset is unavailable.");
    return { kind, session, sessions, wallet };
  }
  async function connect(wallet?: Wallet) {
    if (!state.manifest) {
      notifyError(
        "Local deployment unavailable.",
        undefined,
        "Run local setup and retry.",
      );
      return;
    }
    const id = begin(wallet ? "Connecting wallet" : "Creating test wallet");
    if (id === null) return;
    let connection: Connection | null = null;
    try {
      if (wallet) {
        const account = await connectWallet(wallet);
        if (!current(id)) return;
        connection = await makeConnection(
          asKitSigner(wallet, account),
          address(account.address),
          "injected",
          wallet,
        );
        connection.stopWatching = onWalletAccountsChange(wallet, (accounts) => {
          if (state.connection?.wallet !== wallet) return;
          if (
            !accounts.some((candidate) => candidate.address === account.address)
          ) {
            disconnect();
            notifyError(
              "Wallet account changed.",
              undefined,
              "Reconnect with the account you want to use.",
            );
          }
        });
      } else {
        const signer = await generateKeyPairSigner();
        if (!current(id)) return;
        connection = await makeConnection(signer, signer.address, "test");
      }
      if (!current(id)) {
        dispose(connection);
        return;
      }
      patch({ connection, walletDialogOpen: false, balanceState: "loading" });
      const api = await engine();
      if (!current(id)) return;
      if (!wallet)
        await api.requestFunds(
          connection.session.owner,
          connection.session.selectedAsset.symbol,
        );
      if (!current(id)) return;
      try {
        await api.unlockSession(connection.session);
        if (!current(id)) return;
      } catch (error) {
        if (!current(id)) return;
        notifyError(
          "Connected without confidential keys.",
          error,
          "Use Unlock balances to try again.",
        );
      }
      if (!wallet && current(id) && connection.session.keys) {
        const confirmed: string[] = [];
        try {
          await api.ensureConfidentialAccount(
            connection.session,
            progress(id, confirmed),
          );
        } catch (error) {
          if (current(id)) failure(error, confirmed, connection.session);
        }
      }
      if (current(id)) {
        await refresh(true);
        if (current(id)) patch({ status: null });
      }
    } catch (error) {
      if (current(id)) {
        notifyError(
          "Wallet setup did not finish.",
          error,
          "Check the local network, then reconnect.",
        );
        if (connection && state.connection === connection) {
          failure(error, [], connection.session);
          await refresh(true);
        } else {
          dispose(connection);
          patch({ connection: null, status: null });
        }
      }
    } finally {
      if (current(id)) patch({ busy: false });
    }
  }
  async function selectAsset(asset: LocalAsset) {
    if (state.busy || state.selectedAsset?.mint === asset.mint || unresolvedRpc)
      return;
    const connection = state.connection;
    if (!connection) {
      patch({ selectedAsset: asset, status: null });
      return;
    }
    const session = connection.sessions.get(asset.mint);
    if (!session) return;
    const id = begin("Unlocking balances");
    if (id === null) return;
    patch({
      selectedAsset: asset,
      connection: { ...connection, session },
      balances: EMPTY_BALANCES,
      unwrapped: null,
      balanceState: "loading",
      result: null,
    });
    try {
      const api = await engine();
      if (current(id)) await api.unlockSession(session);
    } catch (error) {
      if (current(id))
        notifyError(
          "Confidential balances are locked.",
          error,
          "Use Unlock balances to try again.",
        );
    } finally {
      if (current(id)) {
        await refresh(true);
        if (current(id)) patch({ busy: false, status: null });
      }
    }
  }
  function failure(error: unknown, confirmed: string[], session: Session) {
    const payload = (error as { failure?: unknown })?.failure ?? error;
    const details = payload as {
      confirmedSignatures?: string[];
      unresolvedSignatures?: string[];
      failedSignatures?: string[];
    };
    const unresolved = details?.unresolvedSignatures ?? [];
    const allConfirmed = Array.from(
      new Set([...confirmed, ...(details?.confirmedSignatures ?? [])]),
    );
    unresolvedRpc = unresolved.length ? session.client.rpc : null;
    patch({
      status: null,
      result: {
        message: unresolved.length
          ? "Confirmation is still unknown. Check status before another transaction."
          : allConfirmed.length
            ? "Some steps completed. Review updated balances before continuing."
            : "The operation did not complete.",
        confirmed: allConfirmed,
        unresolved,
        failed: details?.failedSignatures ?? [],
      },
    });
    notifyError(
      unresolved.length
        ? "Confirmation not yet known."
        : "Could not complete the operation.",
      error,
      unresolved.length
        ? "Use Check status. Do not send the same transaction again."
        : "Review the result and refreshed balances before retrying.",
    );
  }
  async function operate(
    session: Session,
    message: string,
    action: (
      api: typeof import("@/lib/engine"),
      onProgress: Progress,
    ) => Promise<string[]>,
    applyingMint: string | null = null,
  ): Promise<boolean> {
    const id = begin("Preparing transaction");
    if (id === null) return false;
    operationPending = true;
    patch({ applyingMint, result: null });
    const confirmed: string[] = [];
    try {
      const api = await engine();
      if (!current(id)) return false;
      const signatures = await action(api, progress(id, confirmed));
      if (!active) return false;
      patch({
        status: current(id) ? { state: "done", message } : null,
        result: {
          message,
          confirmed: Array.from(new Set([...confirmed, ...signatures])),
          unresolved: [],
          failed: [],
        },
      });
      toast.success(message);
      return current(id);
    } catch (error) {
      if (active) failure(error, confirmed, session);
      return false;
    } finally {
      if (current(id)) await refresh(true);
      operationPending = false;
      if (active) patch({ busy: false, applyingMint: null });
    }
  }
  async function submit(
    action: ExchangeAction,
    amount: bigint,
    recipient: string,
  ): Promise<boolean> {
    const session = state.connection?.session;
    if (!session || amount <= 0n) return false;
    const value = `${formatBaseUnits(amount, session.selectedAsset.decimals)} ${session.selectedAsset.symbol}`;
    const message =
      action === "send"
        ? `Sent ${value}`
        : `Made ${value} ${action === "convert" ? "confidential" : "public"}`;
    return operate(session, message, async (api, onProgress) => {
      if (action === "send")
        return api.send(session, recipient, amount, onProgress);
      if (action === "convert") return api.convert(session, amount, onProgress);
      return (await api.withdraw(session, amount, onProgress)).signatures;
    });
  }
  async function applyIncoming(asset: LocalAsset) {
    const session = state.connection?.sessions.get(asset.mint);
    if (!session) return;
    await operate(
      session,
      `${asset.symbol} payment accepted`,
      async (api, onProgress) => {
        await api.unlockSession(session);
        const signature = await api.applyPendingBalance(session, onProgress);
        return signature ? [signature] : [];
      },
      asset.mint,
    );
  }
  async function funds() {
    const session = state.connection?.session;
    if (!session) return;
    await operate(
      session,
      `${session.selectedAsset.symbol} balance refreshed`,
      async (api, onProgress) => {
        await api.requestFunds(session.owner, session.selectedAsset.symbol);
        await api.ensureConfidentialAccount(session, onProgress);
        return [];
      },
    );
  }
  async function unlock() {
    const session = state.connection?.session;
    if (!session) return;
    const id = begin("Unlocking balances");
    if (id === null) return;
    try {
      const api = await engine();
      if (current(id)) await api.unlockSession(session);
    } catch (error) {
      if (current(id))
        notifyError(
          "Could not unlock balances.",
          error,
          "Approve the wallet signatures and try again.",
        );
    } finally {
      if (current(id)) {
        await refresh(true);
        if (current(id)) patch({ busy: false, status: null });
      }
    }
  }
  async function checkStatus() {
    const rpc = unresolvedRpc;
    const result = state.result;
    if (!rpc || !result || state.busy) return;
    const id = ++generation;
    patch({ busy: true });
    try {
      const { value } = await rpc
        .getSignatureStatuses(result.unresolved.map(parseSignature), {
          searchTransactionHistory: true,
        })
        .send();
      if (!current(id)) return;
      const next = {
        ...result,
        confirmed: [...result.confirmed],
        failed: [...result.failed],
        unresolved: [] as string[],
      };
      value.forEach((status, index) => {
        const signature = result.unresolved[index];
        if (status?.err) next.failed.push(signature);
        else if (
          status?.confirmationStatus === "confirmed" ||
          status?.confirmationStatus === "finalized"
        )
          next.confirmed.push(signature);
        else next.unresolved.push(signature);
      });
      if (next.unresolved.length === 0) unresolvedRpc = null;
      next.message = next.unresolved.length
        ? "Confirmation is still unknown. Check again shortly."
        : "Transaction status checked. Review balances before continuing.";
      patch({ result: next });
      await refresh(true);
    } catch (error) {
      if (current(id))
        notifyError(
          "Could not check transaction status.",
          error,
          "Check the local network and try Check status again.",
        );
    } finally {
      if (current(id)) patch({ busy: false });
    }
  }
  function start() {
    active = true;
    patch({ wallets: listWallets() });
    void load();
    const unwatch = onWalletsChange(() => patch({ wallets: listWallets() }));
    const poll = () => {
      if (document.visibilityState === "visible" && !state.busy) void refresh();
    };
    const interval = window.setInterval(poll, 5000);
    window.addEventListener("focus", poll);
    document.addEventListener("visibilitychange", poll);
    return () => {
      active = false;
      generation++;
      manifestRequest++;
      window.clearInterval(interval);
      unwatch();
      window.removeEventListener("focus", poll);
      document.removeEventListener("visibilitychange", poll);
      dispose(state.connection);
    };
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start,
    load,
    refresh,
    disconnect,
    connect,
    selectAsset,
    submit,
    applyIncoming,
    funds,
    unlock,
    checkStatus,
    setWalletDialogOpen: (open: boolean) => patch({ walletDialogOpen: open }),
    setAccountOpen: (open: boolean) => patch({ accountOpen: open }),
    clearStatus: () => patch({ status: null }),
    closeDetails: () => patch({ detail: null }),
    clearResult: () => {
      if (!unresolvedRpc) patch({ result: null });
    },
  };
}
