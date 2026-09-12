import { AccountDialog, WalletDialog } from "@/components/Account";
import { Exchange } from "@/components/Exchange";
import { IncomingTransfers } from "@/components/IncomingTransfers";
import { TransactionResult } from "@/components/TransactionResult";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { useApplication } from "@/lib/useApplication";

export function App() {
  const { state, application } = useApplication();
  const { connection, selectedAsset, result } = state;
  const connectedAddress = connection?.session.owner ?? "";
  const transactionBlocked = state.busy || (result?.unresolved.length ?? 0) > 0;
  return (
    <div className="min-h-dvh">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-[452px] items-center justify-between gap-3 px-4 py-3">
          <h1 className="text-sm font-semibold tracking-tight">
            Confidential Dollars
          </h1>
          <Button
            type="button"
            variant="outline"
            className="press min-h-11"
            onClick={() =>
              connection
                ? application.setAccountOpen(true)
                : application.setWalletDialogOpen(true)
            }
            aria-label={connection ? "Open wallet account" : undefined}
          >
            {connection
              ? `${connectedAddress.slice(0, 4)}…${connectedAddress.slice(-4)}`
              : "Connect wallet"}
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[452px] space-y-3 px-4 py-6">
        {state.manifestError ? (
          <div role="alert" className="rounded-xl border px-5 py-4 text-sm">
            <p>{state.manifestError}</p>
            <Button
              variant="outline"
              className="mt-3"
              onClick={() => void application.load()}
            >
              Retry setup connection
            </Button>
          </div>
        ) : null}
        <IncomingTransfers
          items={state.incomingTransfers}
          applyingMint={state.applyingMint}
          busy={transactionBlocked}
          onApply={(asset) => void application.applyIncoming(asset)}
        />
        <Exchange
          connected={connection !== null}
          balances={state.balances}
          unwrapped={state.unwrapped}
          balanceState={state.balanceState}
          busy={transactionBlocked}
          status={state.status}
          asset={selectedAsset}
          assets={state.manifest?.assets ?? []}
          onAssetChange={(asset) => void application.selectAsset(asset)}
          onActionChange={application.clearStatus}
          onConnect={() => application.setWalletDialogOpen(true)}
          onSubmit={application.submit}
        />
        {connection &&
        (state.balanceState === "error" || state.balanceState === "locked") ? (
          <Button
            type="button"
            variant="outline"
            disabled={transactionBlocked}
            className="min-h-11 w-full"
            onClick={() =>
              void (state.balanceState === "locked"
                ? application.unlock()
                : application.refresh(true))
            }
          >
            {state.balanceState === "locked"
              ? "Unlock balances"
              : "Retry balances"}
          </Button>
        ) : null}
        {result ? (
          <TransactionResult
            result={result}
            busy={state.busy}
            onCheck={() => void application.checkStatus()}
            onDismiss={application.clearResult}
          />
        ) : null}
        {connection ? (
          <AccountDialog
            publicBalance={state.unwrapped}
            confidentialBalance={state.balances.confidential}
            balanceState={state.balanceState}
            open={state.accountOpen}
            onOpenChange={application.setAccountOpen}
            address={connectedAddress}
            busy={transactionBlocked}
            onFunds={() => void application.funds()}
            onDisconnect={application.disconnect}
            symbol={selectedAsset?.symbol ?? "asset"}
            decimals={selectedAsset?.decimals ?? 6}
          />
        ) : null}
      </main>
      <WalletDialog
        open={state.walletDialogOpen}
        onOpenChange={application.setWalletDialogOpen}
        wallets={state.wallets}
        busy={state.busy}
        onPickWallet={(wallet) => void application.connect(wallet)}
        onNewTestWallet={() => void application.connect()}
      />
      <Toaster position="bottom-center" duration={6000} closeButton />
      <Dialog
        open={state.detail !== null}
        onOpenChange={(open) => {
          if (!open) application.closeDetails();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{state.detail?.title ?? "Details"}</DialogTitle>
            <DialogDescription>Operation details.</DialogDescription>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">
            {state.detail?.body}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
