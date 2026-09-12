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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect wallet</DialogTitle>
          <DialogDescription className="sr-only">
            Choose a wallet.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {wallets.map((wallet) => (
            <Button
              key={wallet.name}
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onPickWallet(wallet)}
              className="press min-h-11 w-full justify-start"
            >
              {wallet.name}
            </Button>
          ))}
          <Button
            type="button"
            disabled={busy}
            onClick={onNewTestWallet}
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
  address: string;
  busy: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFunds: () => void;
  onDisconnect: () => void;
}

export function AccountDialog({
  address,
  busy,
  open,
  onOpenChange,
  onFunds,
  onDisconnect,
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
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onFunds}
            className="press min-h-11 w-full"
          >
            Get test dollars
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
