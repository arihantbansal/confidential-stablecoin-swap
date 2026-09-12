import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBaseUnits } from "@/lib/amounts";
import type { Wallet } from "@/lib/wallets";

export type BalanceState = "loading" | "ready" | "locked" | "error";

interface WalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: readonly Wallet[];
  busy: boolean;
  onPickWallet: (wallet: Wallet) => void;
  onNewTestWallet: () => void;
}

export function WalletDialog({
  open,
  onOpenChange,
  wallets,
  busy,
  onPickWallet,
  onNewTestWallet,
}: WalletDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        returnFocus
        className="max-h-[min(80dvh,30rem)] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>Connect wallet</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a wallet.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-2 divide-y overflow-hidden rounded-lg border">
          {wallets.map((wallet) => (
            <Button
              key={wallet.name}
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => onPickWallet(wallet)}
              className="press min-h-14 w-full justify-start rounded-none px-4"
            >
              <img
                src={wallet.icon}
                alt=""
                aria-hidden="true"
                className="size-8 rounded-md object-contain outline outline-1 outline-black/10 dark:outline-white/10"
              />
              <span>{wallet.name}</span>
            </Button>
          ))}
          {wallets.length === 0 ? (
            <p className="px-4 py-3 text-sm text-muted-foreground">
              No compatible Solana wallets detected.
            </p>
          ) : null}
        </div>
        <div className="border-t pt-3">
          <Button
            type="button"
            disabled={busy}
            onClick={onNewTestWallet}
            variant="secondary"
            className="press min-h-11 w-full"
          >
            Use a test wallet
          </Button>
          <p className="pt-2 text-xs text-muted-foreground">
            Test wallet lives only on this page and disappears on reload or
            disconnect.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface AccountDialogProps {
  publicBalance: bigint | null;
  confidentialBalance: bigint | null;
  address: string;
  busy: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFunds: () => void;
  onDisconnect: () => void;
  symbol: string;
  decimals?: number;
  balanceState?: BalanceState;
}

function unknownBalanceLabel(balanceState?: BalanceState): string {
  if (balanceState === "locked") return "Locked";
  if (balanceState === "error") return "Unavailable";
  return "—";
}

export function AccountDialog({
  publicBalance,
  confidentialBalance,
  address,
  busy,
  open,
  onOpenChange,
  onFunds,
  onDisconnect,
  symbol,
  decimals = 6,
  balanceState,
}: AccountDialogProps) {
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Address copied.");
    } catch {
      toast.error("Could not copy address.", {
        description: "Copy the address manually.",
        duration: Infinity,
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent returnFocus>
        <DialogHeader>
          <DialogTitle>Account</DialogTitle>
          <DialogDescription className="sr-only">
            Connected wallet.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <p
              title={address}
              className="min-w-0 flex-1 font-mono text-xs text-muted-foreground"
            >
              <span aria-hidden="true">
                {address.slice(0, 6)}…{address.slice(-6)}
              </span>
              <span className="sr-only">{address}</span>
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void copyAddress()}
              aria-label="Copy account address"
              className="press min-h-11 shrink-0"
            >
              <Copy aria-hidden="true" />
              Copy
            </Button>
          </div>
          <dl className="space-y-3 rounded-lg bg-muted/60 p-4 text-sm">
            {(
              [
                ["Public", publicBalance],
                ["Confidential", confidentialBalance],
              ] as const
            ).map(([label, balance]) => {
              const loading = balance === null && balanceState === "loading";
              return (
                <div key={label} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd
                    className="flex min-h-5 items-center gap-1.5 tabular-nums"
                    aria-busy={loading}
                  >
                    {loading ? (
                      <>
                        <Skeleton
                          aria-hidden="true"
                          className="h-4 w-16 bg-foreground/10"
                        />
                        <span className="sr-only">Loading balance</span>
                      </>
                    ) : balance === null ? (
                      unknownBalanceLabel(balanceState)
                    ) : (
                      formatBaseUnits(balance, decimals)
                    )}
                    <span>{symbol}</span>
                  </dd>
                </div>
              );
            })}
          </dl>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onFunds}
            className="press min-h-11 w-full"
          >
            Get {symbol}
          </Button>

          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={onDisconnect}
            className="press min-h-11 w-full"
          >
            Disconnect
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
