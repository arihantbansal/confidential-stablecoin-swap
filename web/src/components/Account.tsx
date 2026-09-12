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
import { formatBaseUnits } from "@/lib/amounts";
import type { Wallet } from "@/lib/wallets";

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
      <DialogContent className="max-h-[min(80dvh,30rem)] overflow-y-auto">
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
}: AccountDialogProps) {
  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address);
      toast.success("Address copied.");
    } catch {
      toast.error("Could not copy address.", {
        description: "Copy the address manually.",
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Account</DialogTitle>
          <DialogDescription className="sr-only">
            Connected wallet.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 break-all font-mono text-xs text-muted-foreground">
              {address}
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
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Public</dt>
              <dd className="tabular-nums">
                {publicBalance === null ? "—" : formatBaseUnits(publicBalance)}{" "}
                {symbol}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Confidential</dt>
              <dd className="tabular-nums">
                {confidentialBalance === null
                  ? "—"
                  : formatBaseUnits(confidentialBalance)}{" "}
                {symbol}
              </dd>
            </div>
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
