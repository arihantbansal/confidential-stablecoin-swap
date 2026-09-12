import { type FormEvent, useId, useRef, useState } from "react";
import { formatBaseUnits } from "@/lib/amounts";
import type { BalanceView } from "@/lib/engine";
import { getExchangeState } from "@/lib/exchange";
import type { LocalAsset } from "@/lib/manifest";
import type { ExchangeAction, ExchangeMode } from "@/lib/types";

interface UseExchangeFormOptions {
  balances: BalanceView;
  unwrapped: bigint | null;
  busy: boolean;
  asset: LocalAsset | null;
  onAssetChange: (asset: LocalAsset) => void;
  onActionChange: () => void;
  onSubmit: (
    action: ExchangeAction,
    amount: bigint,
    recipient: string,
  ) => Promise<boolean>;
}

export function useExchangeForm({
  balances,
  unwrapped,
  busy,
  asset,
  onAssetChange,
  onActionChange,
  onSubmit,
}: UseExchangeFormOptions) {
  const [mode, setMode] = useState<ExchangeMode>("convert");
  const [reversed, setReversed] = useState(false);
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [recipientTouched, setRecipientTouched] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [assetPickerOpen, setAssetPickerOpen] = useState(false);

  const amountId = useId();
  const amountErrorId = useId();
  const recipientId = useId();
  const recipientErrorId = useId();
  const statusId = useId();
  const amountRef = useRef<HTMLInputElement>(null);
  const recipientRef = useRef<HTMLInputElement>(null);

  const decimals = asset?.decimals ?? 6;
  const exchangeState = getExchangeState({
    mode,
    reversed,
    amount,
    recipient,
    decimals,
    balances,
    unwrapped,
  });
  const amountError =
    amountTouched && !exchangeState.emptyOrZero
      ? exchangeState.amountError
      : null;
  const recipientError =
    recipientTouched && exchangeState.recipientBad
      ? "Enter a valid recipient address."
      : null;

  function clearForm() {
    setAmount("");
    setAmountTouched(false);
    setRecipientTouched(false);
  }

  function applyMax() {
    if (
      exchangeState.sourceBalance !== null &&
      exchangeState.sourceBalance > 0n
    ) {
      setAmount(formatBaseUnits(exchangeState.sourceBalance, decimals));
      setAmountTouched(false);
    }
  }

  function openReview() {
    if (exchangeState.emptyOrZero || exchangeState.insufficient) {
      return;
    }
    if (exchangeState.amountError) {
      setAmountTouched(true);
      amountRef.current?.focus();
      return;
    }
    if (mode === "send" && exchangeState.recipientBad) {
      setRecipientTouched(true);
      recipientRef.current?.focus();
      return;
    }
    if (exchangeState.canReview) {
      setReviewOpen(true);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) openReview();
  }

  function handleAmountChange(value: string) {
    setAmount(value);
    setAmountTouched(false);
  }

  function handleRecipientChange(value: string) {
    setRecipient(value);
    setRecipientTouched(false);
  }

  async function confirm() {
    if (busy || !exchangeState.canReview || exchangeState.parsed === null) {
      return;
    }
    setReviewOpen(false);
    const ok = await onSubmit(
      exchangeState.internalAction,
      exchangeState.parsed,
      recipient.trim(),
    );
    if (ok) clearForm();
  }

  async function finishConversion() {
    if (balances.public === null || balances.public <= 0n) return;
    const ok = await onSubmit("withdraw", balances.public, "");
    if (ok) clearForm();
  }

  function switchMode(next: ExchangeMode) {
    if (next === mode || busy) return;
    setMode(next);
    setAmountTouched(false);
    setRecipientTouched(false);
    onActionChange();
  }

  function reverseDirection() {
    setReversed((value) => !value);
    setAmountTouched(false);
    onActionChange();
  }

  function handleAssetSelect(candidate: LocalAsset) {
    onAssetChange(candidate);
    setAssetPickerOpen(false);
    setAmountTouched(false);
    onActionChange();
  }

  return {
    mode,
    amount,
    recipient,
    reviewOpen,
    assetPickerOpen,
    amountId,
    amountErrorId,
    recipientId,
    recipientErrorId,
    statusId,
    amountRef,
    recipientRef,
    decimals,
    ...exchangeState,
    amountError,
    recipientError,
    ctaDisabled:
      busy ||
      exchangeState.emptyOrZero ||
      exchangeState.insufficient ||
      exchangeState.sourceBalance === null,
    clearForm,
    applyMax,
    handleSubmit,
    handleAmountChange,
    handleRecipientChange,
    confirm,
    finishConversion,
    switchMode,
    reverseDirection,
    handleAssetSelect,
    setReviewOpen,
    setAssetPickerOpen,
  };
}
