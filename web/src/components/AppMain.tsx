import { AccountDialog } from "@/components/Account";
import { Exchange } from "@/components/Exchange";
import { IncomingTransfers } from "@/components/IncomingTransfers";
import { TransactionResult } from "@/components/TransactionResult";
import { Button } from "@/components/ui/button";
import type { ApplicationState, createApplication } from "@/lib/application";

type Application = ReturnType<typeof createApplication>;

interface AppMainProps {
  state: ApplicationState;
  application: Application;
  transactionBlocked: boolean;
}

export function AppMain({
  state,
  application,
  transactionBlocked,
}: AppMainProps) {
  const { connection, selectedAsset } = state;
  const connectedAddress = connection?.session.owner ?? "";

  return (
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
      {state.result ? (
        <TransactionResult
          result={state.result}
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
  );
}
