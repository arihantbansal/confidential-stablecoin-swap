import type { KeyPairSigner } from "@solana/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signer = { address: "owner-address" } as unknown as KeyPairSigner;
const asset = {
  symbol: "USDC" as const,
  mint: "mint-address",
  decimals: 0,
  tokenProgram: "token-program",
  wrapped: {
    mint: "wrapped-mint",
    escrow: "escrow",
    mintAuthority: "mint-authority",
  },
};
const manifest = {
  rpcHttpUrl: "http://127.0.0.1:8899",
  rpcWsUrl: "ws://127.0.0.1:8900",
  wrapperProgram: "wrapper-program",
  assets: [asset],
};

const engineApi = {
  readUnwrappedBalance: vi.fn(),
  readBalances: vi.fn(),
  requestFunds: vi.fn(),
  unlockSession: vi.fn(),
  ensureConfidentialAccount: vi.fn(),
  convert: vi.fn(),
};
const statusResponses: Array<unknown> = [];
const session = {
  selectedAsset: asset,
  owner: signer.address,
  keys: null,
  disposed: false,
  client: {
    rpc: {
      getSignatureStatuses: vi.fn(() => ({
        send: vi.fn(async () => ({ value: statusResponses.shift() ?? [] })),
      })),
    },
  },
};

vi.mock("@solana/kit", async () => {
  const actual =
    await vi.importActual<typeof import("@solana/kit")>("@solana/kit");
  return {
    ...actual,
    address: (value: string) => value,
    generateKeyPairSigner: vi.fn(async () => signer),
    signature: (value: string) => value,
  };
});
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/manifest", () => ({
  loadManifest: vi.fn(async () => manifest),
}));
vi.mock("@/lib/wallets", () => ({
  asKitSigner: vi.fn(),
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(async () => undefined),
  listWallets: vi.fn(() => []),
  onWalletAccountsChange: vi.fn(() => () => undefined),
  onWalletsChange: vi.fn(() => () => undefined),
}));
vi.mock("@/lib/session", () => ({
  createSession: vi.fn(() => session),
  freeSessionKeys: vi.fn(),
}));
vi.mock("@/lib/engine", () => engineApi);

const { createApplication } = await import("@/lib/application");

function installDom() {
  const listeners = new Map<string, Set<() => void>>();
  const target = {
    visibilityState: "visible",
    addEventListener: (name: string, listener: () => void) => {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
    },
    removeEventListener: (name: string, listener: () => void) =>
      listeners.get(name)?.delete(listener),
  };
  vi.stubGlobal("window", {
    ...target,
    setInterval: vi.fn(() => 1),
    clearInterval: vi.fn(),
  });
  vi.stubGlobal("document", target);
}

async function connectedApplication() {
  installDom();
  const application = createApplication();
  application.start();
  await application.load();
  await application.connect();
  return application;
}

beforeEach(() => {
  vi.clearAllMocks();
  statusResponses.length = 0;
  engineApi.readUnwrappedBalance.mockResolvedValue(10n);
  engineApi.readBalances.mockResolvedValue({
    public: 3n,
    confidential: 2n,
    pending: 0n,
  });
  engineApi.requestFunds.mockResolvedValue(undefined);
  engineApi.unlockSession.mockResolvedValue({});
  engineApi.ensureConfidentialAccount.mockResolvedValue(undefined);
});

describe("application controller", () => {
  it("does not restore a connection when an older connect finishes after disconnect", async () => {
    installDom();
    const { generateKeyPairSigner } = await import("@solana/kit");
    let resolveSigner: (value: typeof signer) => void = () => undefined;
    vi.mocked(generateKeyPairSigner).mockImplementationOnce(
      () => new Promise((resolve) => (resolveSigner = resolve)),
    );
    const application = createApplication();
    application.start();
    await application.load();
    const connecting = application.connect();

    application.disconnect();
    resolveSigner(signer);
    await connecting;

    expect(application.getSnapshot().connection).toBeNull();
    expect(application.getSnapshot().busy).toBe(false);
  });

  it("keeps balances unknown and marks the state as error when reads fail", async () => {
    engineApi.readUnwrappedBalance.mockRejectedValue(new Error("RPC down"));
    engineApi.readBalances.mockRejectedValue(new Error("RPC down"));
    const application = await connectedApplication();

    expect(application.getSnapshot().balanceState).toBe("error");
    expect(application.getSnapshot().balances).toEqual({
      public: null,
      confidential: null,
      pending: null,
    });
    expect(application.getSnapshot().unwrapped).toBeNull();
  });

  it("blocks resubmission while unresolved and classifies confirmed errors as failed", async () => {
    const application = await connectedApplication();
    const unresolved = Object.assign(new Error("timeout"), {
      unresolvedSignatures: ["signature-1"],
    });
    engineApi.convert
      .mockRejectedValueOnce(unresolved)
      .mockResolvedValueOnce(["signature-2"]);

    expect(await application.submit("convert", 1n, "")).toBe(false);
    expect(await application.submit("convert", 1n, "")).toBe(false);
    expect(engineApi.convert).toHaveBeenCalledTimes(1);

    statusResponses.push([
      {
        err: { InstructionError: [0, "Custom"] },
        confirmationStatus: "confirmed",
      },
    ]);
    await application.checkStatus();
    expect(application.getSnapshot().result).toMatchObject({
      unresolved: [],
      confirmed: [],
      failed: ["signature-1"],
    });

    expect(await application.submit("convert", 1n, "")).toBe(true);
    expect(engineApi.convert).toHaveBeenCalledTimes(2);
  });
  it("preserves unresolved receipts across disconnect and allows a status check without keys", async () => {
    const application = await connectedApplication();
    engineApi.convert.mockRejectedValueOnce(
      Object.assign(new Error("timeout"), {
        unresolvedSignatures: ["signature-1"],
      }),
    );
    await application.submit("convert", 1n, "");
    application.disconnect();
    expect(application.getSnapshot().result?.unresolved).toEqual([
      "signature-1",
    ]);
    await application.connect();
    expect(application.getSnapshot().connection).toBeNull();
    statusResponses.push([{ err: null, confirmationStatus: "confirmed" }]);
    await application.checkStatus();
    expect(application.getSnapshot().result).toMatchObject({
      unresolved: [],
      confirmed: ["signature-1"],
    });
  });
  it.each(["confirmed", "unresolved"] as const)(
    "keeps a late %s receipt when disconnect happens during a send",
    async (outcome) => {
      const application = await connectedApplication();
      let finish: (signatures: string[]) => void = () => undefined;
      let fail: (error: Error) => void = () => undefined;
      engineApi.convert.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finish = resolve;
            fail = reject;
          }),
      );
      const submitting = application.submit("convert", 1n, "");
      await vi.waitFor(() =>
        expect(engineApi.convert).toHaveBeenCalledTimes(1),
      );
      application.disconnect();
      expect(application.getSnapshot().busy).toBe(true);
      await application.connect();
      expect(application.getSnapshot().connection).toBeNull();
      if (outcome === "confirmed") finish(["late-signature"]);
      else
        fail(
          Object.assign(new Error("timeout"), {
            unresolvedSignatures: ["late-signature"],
          }),
        );
      expect(await submitting).toBe(false);
      expect(application.getSnapshot().connection).toBeNull();
      expect(application.getSnapshot().busy).toBe(false);
      expect(application.getSnapshot().result?.[outcome]).toEqual([
        "late-signature",
      ]);
      if (outcome === "unresolved") {
        statusResponses.push([{ err: null, confirmationStatus: "confirmed" }]);
        await application.checkStatus();
        expect(application.getSnapshot().result?.confirmed).toEqual([
          "late-signature",
        ]);
      }
    },
  );
  it("shows success once through the persistent receipt", async () => {
    const application = await connectedApplication();
    const { toast } = await import("sonner");
    engineApi.convert.mockResolvedValueOnce(["confirmed-signature"]);
    expect(await application.submit("convert", 1n, "")).toBe(true);
    expect(application.getSnapshot().result?.confirmed).toEqual([
      "confirmed-signature",
    ]);
    expect(application.getSnapshot().status).toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
