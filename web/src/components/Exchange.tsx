import { AmountField } from "@/components/AmountField";
import { AssetPicker } from "@/components/AssetPicker";
import { ExchangeActionButton } from "@/components/ExchangeActionButton";
import { ExchangeMode } from "@/components/ExchangeMode";
import { ExchangePendingConversion } from "@/components/ExchangePendingConversion";
import { ExchangeRecipientField } from "@/components/ExchangeRecipientField";
import { ExchangeReview } from "@/components/ExchangeReview";
import { Card, CardContent } from "@/components/ui/card";
import { useExchangeForm } from "@/components/useExchangeForm";
import { formatBaseUnits } from "@/lib/amounts";
import type { BalanceView } from "@/lib/engine";
import type { LocalAsset } from "@/lib/manifest";
import {
  type BalanceState,
  type ExchangeAction,
  type ExchangeStatus,
  unknownBalanceLabel,
} from "@/lib/types";

interface ExchangeProps {
  connected: boolean;
  balances: BalanceView;
  unwrapped: bigint | null;
  busy: boolean;
  status: ExchangeStatus | null;
  onConnect: () => void;
  onActionChange: () => void;
  onSubmit: (
    action: ExchangeAction,
    amount: bigint,
    recipient: string,
  ) => Promise<boolean>;
  asset: LocalAsset | null;
  assets: readonly LocalAsset[];
  onAssetChange: (asset: LocalAsset) => void;
  balanceState?: BalanceState;
}

function formatBalance(
  value: bigint | null,
  decimals: number,
  balanceState?: BalanceState,
): string {
  return value === null
    ? unknownBalanceLabel(balanceState)
    : formatBaseUnits(value, decimals);
}

export function Exchange({
  connected,
  balances,
  unwrapped,
  busy,
  status,
  onConnect,
  onActionChange,
  onSubmit,
  asset,
  assets,
  onAssetChange,
  balanceState,
}: ExchangeProps) {
  const form = useExchangeForm({
    balances,
    unwrapped,
    busy,
    asset,
    onAssetChange,
    onActionChange,
    onSubmit,
  });
  const symbol = asset?.symbol ?? "—";

  return (
    <section aria-label="Exchange" tabIndex={-1} className="w-full rounded-xl">
      <Card className="gap-0 py-0">
        <CardContent className="p-4">
          <ExchangeMode
            mode={form.mode}
            busy={busy}
            sourceKind={form.sourceKind}
            targetKind={form.targetKind}
            onModeChange={form.switchMode}
            onReverse={form.reverseDirection}
          />
          <form onSubmit={form.handleSubmit}>
            <div className="mt-4 space-y-2">
              <AmountField
                amountId={form.amountId}
                amountErrorId={form.amountErrorId}
                amount={form.amount}
                amountError={form.amountError}
                busy={busy}
                sourceKind={form.sourceKind}
                sourceBalanceText={formatBalance(
                  form.sourceBalance,
                  form.decimals,
                  connected ? balanceState : undefined,
                )}
                maxDisabled={
                  busy ||
                  form.sourceBalance === null ||
                  form.sourceBalance <= 0n
                }
                inputRef={form.amountRef}
                assetControl={
                  <AssetPicker
                    asset={asset}
                    assets={assets}
                    open={form.assetPickerOpen}
                    busy={busy}
                    onOpenChange={form.setAssetPickerOpen}
                    onSelect={form.handleAssetSelect}
                  />
                }
                onAmountChange={form.handleAmountChange}
                onApplyMax={form.applyMax}
              />
              {form.mode === "send" ? (
                <ExchangeRecipientField
                  id={form.recipientId}
                  errorId={form.recipientErrorId}
                  value={form.recipient}
                  error={form.recipientError}
                  busy={busy}
                  inputRef={form.recipientRef}
                  onChange={form.handleRecipientChange}
                />
              ) : null}
            </div>
            <ExchangeActionButton
              connected={connected}
              busy={busy}
              status={status}
              ctaDisabled={form.ctaDisabled}
              ctaLabel={form.ctaLabel}
              statusId={form.statusId}
              onConnect={onConnect}
            />
          </form>
          <p id={form.statusId} role="status" className="sr-only">
            {status?.message ?? ""}
          </p>
          <ExchangePendingConversion
            connected={connected}
            publicBalance={balances.public}
            decimals={form.decimals}
            symbol={symbol}
            busy={busy}
            onFinish={form.finishConversion}
          />
          <ExchangeReview
            open={form.reviewOpen}
            busy={busy || !form.canReview}
            mode={form.mode}
            parsed={form.parsed}
            decimals={form.decimals}
            symbol={symbol}
            recipient={form.recipient}
            internalAction={form.internalAction}
            confirmLabel={form.displayLabel}
            onOpenChange={form.setReviewOpen}
            onConfirm={form.confirm}
          />
        </CardContent>
      </Card>
    </section>
  );
}
