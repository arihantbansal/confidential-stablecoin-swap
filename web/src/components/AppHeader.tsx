import { Button } from "@/components/ui/button";

interface AppHeaderProps {
  connected: boolean;
  address: string;
  onOpenAccount: () => void;
  onOpenWallet: () => void;
}

export function AppHeader({
  connected,
  address,
  onOpenAccount,
  onOpenWallet,
}: AppHeaderProps) {
  return (
    <header className="border-b">
      <div className="mx-auto flex w-full max-w-[452px] items-center justify-between gap-3 px-4 py-3">
        <h1 className="text-sm font-semibold tracking-tight">
          Confidential Dollars
        </h1>
        <Button
          type="button"
          variant="outline"
          className="press min-h-11"
          onClick={connected ? onOpenAccount : onOpenWallet}
          aria-label={connected ? "Open wallet account" : undefined}
        >
          {connected
            ? `${address.slice(0, 4)}…${address.slice(-4)}`
            : "Connect wallet"}
        </Button>
      </div>
    </header>
  );
}
