import { AppDialogs } from "@/components/AppDialogs";
import { AppHeader } from "@/components/AppHeader";
import { AppMain } from "@/components/AppMain";
import { useApplication } from "@/lib/useApplication";

export function App() {
  const { state, application } = useApplication();
  const connected = state.connection !== null;
  const address = state.connection?.session.owner ?? "";
  const transactionBlocked =
    state.busy || (state.result?.unresolved.length ?? 0) > 0;

  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr]">
      <AppHeader
        connected={connected}
        address={address}
        onOpenAccount={() => application.setAccountOpen(true)}
        onOpenWallet={() => application.setWalletDialogOpen(true)}
      />
      <AppMain
        state={state}
        application={application}
        transactionBlocked={transactionBlocked}
      />
      <AppDialogs state={state} application={application} />
    </div>
  );
}
