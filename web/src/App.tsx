import {
  AlertTriangle,
  ArrowDownRight,
  Check,
  Download,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  WatchWalletChanges,
  disconnect as varialDisconnect,
  getAddress,
  getNetworkDetails,
  isAllowed,
  isConnected,
  requestAccess,
} from "@stellar/varial-sdk";
import { AccountView } from "./components/AccountView";
import type { SavedSummary } from "./components/AccountView";
import { ActionPanel } from "./components/ActionPanel";
import type { Role } from "./components/ActionPanel";
import { AgreementDetails } from "./components/AgreementDetails";
import { Faq } from "./components/Faq";
import { Seal } from "./components/Seal";
import { SiteFooter } from "./components/SiteFooter";
import { StatusPill } from "./components/StatusPill";
import { Timeline } from "./components/Timeline";
import { Toast } from "./components/Toast";
import type { ToastState } from "./components/Toast";
import { VarialHelp } from "./components/VarialHelp";
import { WalletButton } from "./components/WalletButton";
import {
  DEFAULT_CONTRACT_ID,
  MEDIATOR_ADDRESS,
  NATIVE_TOKEN_ID,
  NETWORK_PASSPHRASE,
  bytesFromHex,
  bytesValue,
  deployAgreement,
  endOfDayUnix,
  formatAmount,
  humanizeError,
  i128Value,
  invokeContract,
  readAgreement,
  readArbiter,
  xlmToStroops,
} from "./lib/stellar";
import type { Agreement } from "./lib/stellar";
import {
  getSavedAgreements,
  parseAgreementInput,
  removeAgreement,
  saveAgreement,
} from "./lib/agreements";

type View = "home" | "account";

function getInitialContract(): string {
  const query = new URLSearchParams(window.location.search).get("contract");
  if (query && /^C[A-Z2-7]{55}$/i.test(query)) return query.toUpperCase();
  return DEFAULT_CONTRACT_ID;
}

function getInitialView(): View {
  return new URLSearchParams(window.location.search).get("view") === "cuenta"
    ? "account"
    : "home";
}

const SESSION_KEY = "deposito-seguro:session";

function hasActiveSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function roleFor(
  wallet: string | null,
  agreement: Agreement | null,
  arbiter: string | null,
): Role {
  if (!wallet || !agreement) return "viewer";
  const account = wallet.toUpperCase();
  if (account === agreement.tenant.toUpperCase()) return "tenant";
  if (account === agreement.landlord.toUpperCase()) return "landlord";
  if (account === arbiter?.toUpperCase()) return "arbiter";
  return "viewer";
}

function shortDate(timestamp: bigint): string {
  const date = new Date(Number(timestamp) * 1000);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat("es-CR", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(date);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function SkeletonPanel() {
  return (
    <div className="panel skeleton-panel" aria-label="Cargando acuerdo">
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--amount" />
      <div className="skeleton skeleton--row" />
      <div className="skeleton skeleton--row" />
      <div className="skeleton skeleton--row" />
    </div>
  );
}

function ErrorPanel({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="panel error-panel" role="alert">
      <AlertTriangle size={22} />
      <h2>No pudimos leer el acuerdo</h2>
      <p>{message}</p>
      <button type="button" className="button button--outline" onClick={onRetry}>
        <RefreshCw size={15} />
        Reintentar
      </button>
    </div>
  );
}

export default function App() {
  const [contractId, setContractId] = useState(getInitialContract);
  const [view, setView] = useState<View>(getInitialView);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [arbiter, setArbiter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [summaries, setSummaries] = useState<SavedSummary[]>([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [walletNetwork, setWalletNetwork] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const toastTimer = useRef<number | null>(null);
  const sessionEnded = useRef(false);

  const showToast = useCallback((next: Omit<ToastState, "id">) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ ...next, id: Date.now() });
    toastTimer.current = window.setTimeout(
      () => setToast(null),
      next.type === "error" ? 10_000 : 6_500,
    );
  }, []);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      setLoadError(null);
      try {
        const [nextAgreement, nextArbiter] = await Promise.all([
          readAgreement(contractId),
          readArbiter(contractId),
        ]);
        setAgreement(nextAgreement);
        setArbiter(nextArbiter);
      } catch (error) {
        console.error(error);
        setLoadError(humanizeError(error));
        setAgreement(null);
      } finally {
        setLoading(false);
      }
    },
    [contractId],
  );

  const refreshSaved = useCallback(
    async (showLoading = true) => {
      if (!wallet) {
        setSavedIds([]);
        setSummaries([]);
        setSavedLoading(false);
        return;
      }

      const ids = getSavedAgreements(wallet);
      setSavedIds(ids);
      if (!ids.length) {
        setSummaries([]);
        setSavedLoading(false);
        return;
      }

      if (showLoading) setSavedLoading(true);
      const results = await Promise.all(
        ids.map(async (id): Promise<SavedSummary> => {
          try {
            const [nextAgreement, nextArbiter] = await Promise.all([
              readAgreement(id),
              readArbiter(id),
            ]);
            return {
              contractId: id,
              agreement: nextAgreement,
              arbiter: nextArbiter,
              role: roleFor(wallet, nextAgreement, nextArbiter),
            };
          } catch (error) {
            return {
              contractId: id,
              agreement: null,
              arbiter: null,
              role: "viewer",
              error: humanizeError(error),
            };
          }
        }),
      );
      setSummaries(results);
      setSavedLoading(false);
    },
    [wallet],
  );

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(true), 30_000);
    const onFocus = () => void load(true);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  useEffect(() => {
    void refreshSaved();
  }, [refreshSaved]);

  useEffect(() => {
    if (!wallet || !agreement) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("invite") !== "1") return;
    if (roleFor(wallet, agreement, arbiter) === "viewer") return;

    if (!savedIds.includes(contractId)) {
      const next = saveAgreement(wallet, contractId);
      setSavedIds(next);
      void refreshSaved(false);
      showToast({
        type: "success",
        message: "Acuerdo agregado a tu cuenta desde la invitación.",
      });
    }

    params.delete("invite");
    const url = new URL(window.location.href);
    url.search = params.toString();
    window.history.replaceState({}, "", url);
  }, [
    wallet,
    agreement,
    arbiter,
    savedIds,
    contractId,
    refreshSaved,
    showToast,
  ]);

  useEffect(() => {
    const interval = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!wallet) return;
    const watcher = new WatchWalletChanges(1_500);
    const subscription = watcher.watch(({ address, networkPassphrase, error }) => {
      if (sessionEnded.current || error || !address) return;
      if (address.toUpperCase() === wallet.toUpperCase()) return;
      setWallet(address);
      setWalletNetwork(networkPassphrase || null);
      showToast({
        type: "info",
        message: `Ahora estás con la cuenta •••• ${address.slice(-4)}.`,
      });
    });
    if (subscription.error) {
      watcher.stop();
    }
    return () => watcher.stop();
  }, [wallet, showToast]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key?.startsWith("deposito-seguro:saved-agreements")) {
        void refreshSaved(false);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [refreshSaved]);

  useEffect(() => {
    const onPopState = () => {
      setView(getInitialView());
      setContractId(getInitialContract());
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!hasActiveSession()) return;
    let active = true;
    async function restoreWallet() {
      try {
        const connected = await withTimeout(
          isConnected(),
          3_000,
          "Varial no respondió.",
        );
        if (!connected.isConnected) return;
        const allowed = await withTimeout(
          isAllowed(),
          3_000,
          "Varial no respondió.",
        );
        if (!allowed.isAllowed) return;
        const address = await withTimeout(
          getAddress(),
          5_000,
          "Varial no respondió.",
        );
        if (!active || address.error || !address.address) return;
        setWallet(address.address);
        const network = await getNetworkDetails();
        if (!network.error) setWalletNetwork(network.networkPassphrase);
      } catch {
        // Varial no está instalado; la app sigue en modo lectura.
      }
    }
    void restoreWallet();
    return () => {
      active = false;
    };
  }, []);

  async function connectWallet() {
    setWalletConnecting(true);
    try {
      const installed = await withTimeout(
        isConnected(),
        3_000,
        "Varial no respondió.",
      );
      if (!installed.isConnected) {
        setHelpOpen(true);
        if (helpOpen) {
          showToast({
            type: "info",
            message:
              "Todavía no encontramos Varial. Instalalo y recargá esta página.",
          });
        }
        return;
      }

      const access = await withTimeout(
        requestAccess(),
        30_000,
        "Varial no respondió. Desbloqueá la extensión y probá de nuevo.",
      );
      if (access.error) throw new Error(access.error.message);
      if (!access.address) throw new Error("Varial no devolvió una cuenta.");
      sessionEnded.current = false;
      setWallet(access.address);
      try {
        sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // La sesión funciona igual dentro de esta pestaña.
      }
      setHelpOpen(false);
      try {
        const network = await getNetworkDetails();
        if (!network.error) setWalletNetwork(network.networkPassphrase);
      } catch {
        setWalletNetwork(null);
      }
      showToast({
        type: "success",
        message: `Ingresaste con la cuenta •••• ${access.address.slice(-4)}.`,
      });

      if (
        view === "home" &&
        contractId === DEFAULT_CONTRACT_ID &&
        getSavedAgreements(access.address).length > 0
      ) {
        goToAccount();
      }
    } catch (error) {
      const message =
        error instanceof Error && /Varial|Freighter/i.test(error.message)
          ? error.message
          : humanizeError(error);
      if (/no respondió|no se encontró|instalá/i.test(message)) {
        setHelpOpen(true);
      } else {
        showToast({ type: "error", message });
      }
    } finally {
      setWalletConnecting(false);
    }
  }

  function disconnectWallet() {
    sessionEnded.current = true;
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // Sin sessionStorage, igual limpiamos el estado en memoria.
    }
    try {
      void varialDisconnect().catch(() => {
        // Si la extensión no responde, la sesión local ya quedó cerrada.
      });
    } catch {
      // La extensión no está disponible; la sesión local ya quedó cerrada.
    }
    setWallet(null);
    setWalletNetwork(null);
    setView("home");
    setContractId(DEFAULT_CONTRACT_ID);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("view");
      url.searchParams.delete("contract");
      url.searchParams.delete("invite");
      window.history.replaceState({}, "", url);
    } catch {
      // La app funciona igual si history no está disponible.
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast({
      type: "info",
      message:
        "Sesión cerrada. Para usar otra cuenta, cambiala en Varial y volvé a ingresar.",
    });
  }

  function copyValue(value: string, label: string) {
    void navigator.clipboard
      .writeText(value)
      .then(() => showToast({ type: "info", message: `${label} copiado.` }))
      .catch(() =>
        showToast({ type: "error", message: "No se pudo copiar al portapapeles." }),
      );
  }

  function writeUrl(nextView: View, nextContract = contractId) {
    try {
      const url = new URL(window.location.href);
      if (nextView === "account") {
        url.searchParams.set("view", "cuenta");
        url.searchParams.delete("contract");
      } else {
        url.searchParams.delete("view");
        if (nextContract !== DEFAULT_CONTRACT_ID) {
          url.searchParams.set("contract", nextContract);
        } else {
          url.searchParams.delete("contract");
        }
      }
      window.history.pushState({}, "", url);
    } catch {
      // La app funciona igual si el navegador bloquea history.
    }
  }

  function goHome() {
    setView("home");
    setContractId(DEFAULT_CONTRACT_ID);
    writeUrl("home", DEFAULT_CONTRACT_ID);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToAccount() {
    setView("account");
    writeUrl("account");
    void refreshSaved(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goToAgreement(nextContractId: string) {
    setView("home");
    setContractId(nextContractId);
    writeUrl("home", nextContractId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goHelp() {
    if (view === "account") {
      goHome();
      window.setTimeout(() => {
        document.getElementById("ayuda")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }, 80);
      return;
    }
    document.getElementById("ayuda")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function saveCurrentAgreement() {
    if (!wallet) {
      setHelpOpen(true);
      return;
    }
    if (!agreement || roleFor(wallet, agreement, arbiter) === "viewer") {
      showToast({
        type: "error",
        message: "Esta cuenta no participa en el acuerdo.",
      });
      return;
    }
    const next = saveAgreement(wallet, contractId);
    setSavedIds(next);
    void refreshSaved(false);
    showToast({
      type: "success",
      message: "Acuerdo guardado en tu cuenta.",
    });
  }

  function removeSavedAgreement(id: string) {
    if (!wallet) return;
    const next = removeAgreement(wallet, id);
    setSavedIds(next);
    setSummaries((current) => current.filter((item) => item.contractId !== id));
    void refreshSaved(false);
    showToast({ type: "info", message: "Acuerdo quitado de tu cuenta." });
  }

  async function addSavedAgreement(
    input: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!wallet) {
      return { ok: false, error: "Ingresá con tu cuenta para agregar acuerdos." };
    }
    const id = parseAgreementInput(input);
    if (!id) {
      return {
        ok: false,
        error: "No encontramos un acuerdo válido en ese enlace o código.",
      };
    }
    if (savedIds.includes(id)) {
      return { ok: false, error: "Ese acuerdo ya está en tu cuenta." };
    }

    try {
      const [nextAgreement, nextArbiter] = await Promise.all([
        readAgreement(id),
        readArbiter(id),
      ]);
      if (roleFor(wallet, nextAgreement, nextArbiter) === "viewer") {
        return {
          ok: false,
          error: "Tu cuenta no participa en ese acuerdo. Pedile el enlace a la otra parte.",
        };
      }
      const next = saveAgreement(wallet, id);
      setSavedIds(next);
      await refreshSaved(false);
      showToast({ type: "success", message: "Acuerdo agregado a tu cuenta." });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: humanizeError(error) };
    }
  }

  async function createAgreement(input: {
    tenant: string;
    amount: string;
    leaseEnd: string;
  }): Promise<{ ok: boolean; error?: string; contractId?: string }> {
    if (!wallet) {
      return { ok: false, error: "Ingresá con tu cuenta para crear acuerdos." };
    }
    setCreating(true);
    try {
      const id = await deployAgreement({
        landlord: wallet,
        tenant: input.tenant.trim().toUpperCase(),
        amount: xlmToStroops(input.amount),
        leaseEnd: endOfDayUnix(input.leaseEnd),
      });
      const next = saveAgreement(wallet, id);
      setSavedIds(next);
      await refreshSaved(false);
      showToast({
        type: "success",
        message: "Acuerdo creado y guardado en tu cuenta.",
      });
      return { ok: true, contractId: id };
    } catch (error) {
      console.error(error);
      return { ok: false, error: humanizeError(error) };
    } finally {
      setCreating(false);
    }
  }

  function shareAgreement(id: string) {
    const url = `${window.location.origin}${window.location.pathname}?contract=${id}&invite=1`;
    void navigator.clipboard
      .writeText(url)
      .then(() =>
        showToast({
          type: "success",
          message: "Enlace de invitación copiado.",
        }),
      )
      .catch(() =>
        showToast({
          type: "error",
          message: "No se pudo copiar el enlace.",
        }),
      );
  }

  async function runAction(
    method: string,
    action: (address: string) => Promise<{ hash: string }>,
    successMessage: string,
  ) {
    if (!wallet) {
      setHelpOpen(true);
      return;
    }
    setBusy(method);
    try {
      await action(wallet);
      showToast({ type: "success", message: successMessage });
      await load(true);
    } catch (error) {
      console.error(error);
      showToast({ type: "error", message: humanizeError(error) });
    } finally {
      setBusy(null);
    }
  }

  function fund() {
    void runAction(
      "fund",
      (address) => invokeContract(contractId, "fund", [], address),
      "Depósito recibido. El acuerdo ya está vigente.",
    );
  }

  function claim() {
    void runAction(
      "claim",
      (address) => invokeContract(contractId, "claim", [], address),
      "Depósito reclamado. El acuerdo quedó cerrado.",
    );
  }

  function dispute(hash: string) {
    try {
      const evidence = bytesValue(bytesFromHex(hash));
      void runAction(
        "dispute",
        (address) =>
          invokeContract(contractId, "dispute", [evidence], address),
        "Reclamo presentado. Un mediador va a revisarlo.",
      );
    } catch (error) {
      showToast({ type: "error", message: humanizeError(error) });
    }
  }

  function resolve(tenantRefund: bigint) {
    void runAction(
      "resolve",
      (address) =>
        invokeContract(contractId, "resolve", [i128Value(tenantRefund)], address),
      "Reclamo resuelto. El depósito fue repartido.",
    );
  }

  function scrollToActions() {
    document.getElementById("acciones")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  const role = roleFor(wallet, agreement, arbiter);
  const isCurrentSaved = Boolean(wallet && savedIds.includes(contractId));

  const isNative = agreement?.token === NATIVE_TOKEN_ID;
  const amountLabel = agreement
    ? `${formatAmount(agreement.amount)} ${isNative ? "XLM" : "moneda"}`
    : "—";
  const networkMismatch =
    Boolean(walletNetwork) && walletNetwork !== NETWORK_PASSPHRASE;

  return (
    <div className="app" id="top">
      <header className="site-header">
        <div className="shell header-inner">
          <a
            className="brand"
            href="#top"
            aria-label="Depósito Seguro, inicio"
            onClick={(event) => {
              event.preventDefault();
              goHome();
            }}
          >
            <span className="brand__mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none">
                <path
                  d="M5 14.5 16 5l11 9.5V27a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V14.5Z"
                  stroke="currentColor"
                  strokeWidth="1.7"
                />
                <path
                  d="M12 28V19h8v9M22 9.5V5h3v7"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <span className="brand__text">
              <strong>Depósito Seguro</strong>
              <small>Depósito de alquiler</small>
            </span>
          </a>

          <div className="header-tools">
            <button
              type="button"
              className="header-link header-link--help"
              onClick={goHelp}
            >
              Ayuda
            </button>
            {wallet && (
              <button
                type="button"
                className={`header-link header-link--account${view === "account" ? " is-active" : ""}`}
                onClick={goToAccount}
              >
                <UserRound size={14} strokeWidth={1.8} />
                <span className="account-label">Mis acuerdos</span>
                {savedIds.length > 0 && (
                  <span className="count-badge">{savedIds.length}</span>
                )}
              </button>
            )}
            <WalletButton
              address={wallet}
              connecting={walletConnecting}
              onConnect={connectWallet}
              onDisconnect={disconnectWallet}
            />
          </div>
        </div>
      </header>

      {networkMismatch && (
        <div className="shell">
          <div className="warning-banner" role="alert">
            <AlertTriangle size={16} />
            Tu cuenta está en otra red. Abrí Varial y cambiá a la red de prueba
            antes de confirmar.
          </div>
        </div>
      )}

      {view === "account" ? (
        <AccountView
          wallet={wallet}
          mediator={MEDIATOR_ADDRESS}
          summaries={summaries}
          loading={savedLoading}
          creating={creating}
          onOpen={goToAgreement}
          onRemove={removeSavedAgreement}
          onShare={shareAgreement}
          onAdd={addSavedAgreement}
          onCreate={createAgreement}
          onConnect={connectWallet}
          onSwitchAccount={disconnectWallet}
          onCopyAccount={() => wallet && copyValue(wallet, "Tu identificador")}
          onHelp={() => setHelpOpen(true)}
          onBack={goHome}
        />
      ) : (
        <>
      <section className="hero shell">
        <div className="hero__copy">
          <p className="eyebrow">Contrato de arrendamiento · Costa Rica</p>
          <h1>El depósito no debería depender de la buena fe.</h1>
          <p className="hero__lead">
            Un acuerdo neutral guarda el depósito de garantía y lo devuelve con
            reglas claras: acuerdo entre las partes, quince días sin reclamos o
            decisión de un mediador.
          </p>

          <div className="hero__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={wallet ? scrollToActions : connectWallet}
              disabled={walletConnecting}
            >
              {wallet ? "Ir a las acciones" : "Ingresar"}
              <ArrowDownRight size={16} />
            </button>
            <a className="button button--ghost" href="#como-funciona">
              Cómo funciona
              <ArrowDownRight size={15} />
            </a>
          </div>
          <button
            type="button"
            className="hero__help"
            onClick={() => setHelpOpen(true)}
          >
            <Download size={14} />
            ¿No tenés cuenta? Descargá Varial
          </button>
          {wallet && savedIds.length > 0 && (
            <button type="button" className="hero__help" onClick={goToAccount}>
              <UserRound size={14} />
              Tenés {savedIds.length} {savedIds.length === 1 ? "acuerdo" : "acuerdos"}{" "}
              guardados · Ver mi cuenta
            </button>
          )}

          <dl className="hero__stats">
            <div>
              <dt>En custodia</dt>
              <dd>{amountLabel}</dd>
            </div>
            <div>
              <dt>Estado</dt>
              <dd>
                {agreement ? (
                  <StatusPill status={agreement.status} />
                ) : (
                  <span className="muted">Cargando</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Reclamo</dt>
              <dd>
                {agreement ? shortDate(agreement.claim_deadline) : "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="hero__visual" aria-hidden={!agreement}>
          <div className="dossier-card">
            <div className="dossier-card__top">
              <span>Expediente digital</span>
              <span>Confidencial</span>
            </div>

            <div className="dossier-card__seal">
              {agreement ? (
                <Seal status={agreement.status} />
              ) : (
                <div className="seal-placeholder">
                  <Sparkles size={22} />
                </div>
              )}
            </div>

            <div className="dossier-card__amount">
              <span>Depósito</span>
              <strong>{amountLabel}</strong>
            </div>

            <div className="dossier-card__parties">
              <div>
                <span>Inquilino</span>
                <strong className="mono">
                  {agreement ? `•••• ${agreement.tenant.slice(-4)}` : "—"}
                </strong>
              </div>
              <div>
                <span>Arrendador</span>
                <strong className="mono">
                  {agreement ? `•••• ${agreement.landlord.slice(-4)}` : "—"}
                </strong>
              </div>
            </div>

            <div className="dossier-card__foot">
              <span>Custodia neutral</span>
              <span className="dossier-card__line" />
              <span>Costa Rica</span>
            </div>
          </div>
          <div className="dossier-card__shadow" />
        </div>
      </section>

      <main className="shell workspace" id="acuerdo">
        <div className="workspace__main">
          {loading && !agreement ? (
            <SkeletonPanel />
          ) : loadError ? (
            <ErrorPanel message={loadError} onRetry={() => void load()} />
          ) : agreement ? (
            <>
              <AgreementDetails
                agreement={agreement}
                arbiter={arbiter}
                wallet={wallet}
                onCopy={copyValue}
              />
              <Timeline agreement={agreement} now={now} />
            </>
          ) : null}
        </div>

        <div className="workspace__side">
          {loadError ? (
            <div className="trust-note">
              <AlertTriangle size={17} />
              <p>Revisá tu conexión e intentá de nuevo en un momento.</p>
            </div>
          ) : agreement ? (
            <ActionPanel
              agreement={agreement}
              arbiter={arbiter}
              wallet={wallet}
              role={role}
              now={now}
              busy={busy}
              saved={isCurrentSaved}
              onSave={saveCurrentAgreement}
              onFund={fund}
              onClaim={claim}
              onDispute={dispute}
              onResolve={resolve}
              onConnect={connectWallet}
              onHelp={() => setHelpOpen(true)}
              onRefresh={() => void load(true)}
            />
          ) : (
            <SkeletonPanel />
          )}

          <div className="trust-note">
            <ShieldCheck size={17} />
            <p>
              <strong>El servicio no reemplaza a un juez.</strong> Si hay daños,
              un mediador neutral decide. El depósito no queda en manos de una
              sola parte mientras se resuelve.
            </p>
          </div>
        </div>
      </main>

      <section className="how shell" id="como-funciona" aria-labelledby="how-title">
        <div className="section-heading">
          <p className="eyebrow">Cómo funciona</p>
          <h2 id="how-title">Tres salidas. Ninguna unilateral.</h2>
        </div>
        <div className="steps">
          <article className="step">
            <span className="step__number">01</span>
            <div className="step__icon">
              <ArrowDownRight size={20} />
            </div>
            <h3>El inquilino deposita</h3>
            <p>
              El monto exacto pasa de su cuenta al acuerdo. Ni el arrendador ni
              el mediador pueden retirarlo por su cuenta.
            </p>
          </article>
          <article className="step">
            <span className="step__number">02</span>
            <div className="step__icon">
              <Check size={20} />
            </div>
            <h3>Las reglas deciden</h3>
            <p>
              A los 15 días del fin del alquiler, el inquilino reclama todo. Si
              el arrendador presenta un reclamo, el mediador resuelve.
            </p>
          </article>
          <article className="step">
            <span className="step__number">03</span>
            <div className="step__icon">
              <ShieldCheck size={20} />
            </div>
            <h3>Todos ven el resultado</h3>
            <p>
              El estado del acuerdo se puede consultar en cualquier momento.
              Sin llamados ni sorpresas.
            </p>
          </article>
        </div>
      </section>

      <Faq />
        </>
      )}

      <SiteFooter />

      <VarialHelp
        open={helpOpen}
        connecting={walletConnecting}
        onClose={() => setHelpOpen(false)}
        onRetry={connectWallet}
      />

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
