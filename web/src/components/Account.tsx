import { Copy } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Wallet } from "@/lib/wallets";

interface WalletDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wallets: readonly Wallet[];
  busy: boolean;
  importError: string | null;
  onPickWallet: (wallet: Wallet) => void;
  onNewTestWallet: () => void;
  onImport: (text: string, password: string) => void;
}

export function WalletDialog({
  open,
  onOpenChange,
  wallets,
  busy,
  importError,
  onPickWallet,
  onNewTestWallet,
  onImport,
}: WalletDialogProps) {
  const [password, setPassword] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const fileText = useRef<string | null>(null);
  const passwordId = useId();
  const fileId = useId();

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setFileName(file.name);
    fileText.current = await file.text();
  }

  function handleImport() {
    if (fileText.current) {
      onImport(fileText.current, password);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect</DialogTitle>
          <DialogDescription>
            Use an installed wallet, or a disposable local test wallet.
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
            New local test wallet
          </Button>
          <p className="text-xs text-muted-foreground">
            Local test wallets are lost on reload unless you export a recovery
            file.
          </p>
        </div>
        <div className="space-y-2 border-t pt-4">
          <Label htmlFor={fileId} className="text-sm">
            Recover from file
          </Label>
          <Input
            id={fileId}
            type="file"
            accept="application/json,.json"
            onChange={handleFile}
            className="min-h-11"
          />
          {fileName ? (
            <div className="flex gap-2">
              <Input
                id={passwordId}
                type="password"
                autoComplete="off"
                placeholder="Recovery password"
                aria-label="Recovery password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-11"
              />
              <Button
                type="button"
                disabled={busy || password === ""}
                onClick={handleImport}
                className="press min-h-11 shrink-0"
              >
                Import
              </Button>
            </div>
          ) : null}
          {importError ? (
            <p role="alert" className="text-xs text-destructive">
              {importError}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface AccountSectionProps {
  address: string;
  isTestWallet: boolean;
  busy: boolean;
  onFunds: () => void;
  onExport: (password: string) => void;
  onDisconnect: () => void;
}

export function AccountSection({
  address,
  isTestWallet,
  busy,
  onFunds,
  onExport,
  onDisconnect,
}: AccountSectionProps) {
  const [password, setPassword] = useState("");
  const passwordId = useId();

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
    <details className="group rounded-xl border bg-card text-card-foreground shadow-sm">
      <summary className="cursor-pointer list-none px-5 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-3">
          Account
          <span className="max-w-36 truncate font-mono text-xs font-normal text-muted-foreground">
            {address}
          </span>
        </span>
      </summary>
      <div className="space-y-3 border-t px-5 py-4">
        <div className="flex items-start justify-between gap-2">
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
            className="press min-h-11 min-w-11 shrink-0"
          >
            <Copy aria-hidden="true" />
            Copy
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onFunds}
            className="press min-h-11"
          >
            Get test dollars
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onDisconnect}
            className="press min-h-11"
          >
            Disconnect
          </Button>
        </div>
        {isTestWallet ? (
          <div className="space-y-2 border-t pt-3">
            <Label htmlFor={passwordId} className="text-sm">
              Export recovery file
            </Label>
            <div className="flex gap-2">
              <Input
                id={passwordId}
                type="password"
                autoComplete="new-password"
                placeholder="8+ characters"
                aria-label="Recovery file password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="min-h-11"
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy || password.length < 8}
                onClick={() => onExport(password)}
                className="press min-h-11 shrink-0"
              >
                Export
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Anyone with the file and password takes these funds.
            </p>
          </div>
        ) : null}
      </div>
    </details>
  );
}
