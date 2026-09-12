import { WalletDialog } from "@/components/Account";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import type { ApplicationState, createApplication } from "@/lib/application";

type Application = ReturnType<typeof createApplication>;

interface AppDialogsProps {
  state: ApplicationState;
  application: Application;
}

export function AppDialogs({ state, application }: AppDialogsProps) {
  return (
    <>
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
    </>
  );
}
