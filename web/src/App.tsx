import {
  AlertTriangle,
  ArrowDownRight,
  Check,
  Download,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getAddress,
  getNetworkDetails,
  isAllowed,
  isConnected,
  requestAccess,
} from "@stellar/varial-sdk";
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
  NATIVE_TOKEN_ID,
  NETWORK_PASSPHRASE,
  bytesFromHex,
  bytesValue,
  formatAmount,
  humanizeError,
  i128Value,
  invokeContract,
  readAgreement,
  readArbiter,
} from "./lib/stellar";
import type { Agreement } from "./lib/stellar";

function getInitialContract(): string {
  const query = new URLSearchParams(window.location.search).get("contract");
  if (query && /^C[A-Z2-7]{55}$/i.test(query)) return query.toUpperCase();
  return DEFAULT_CONTRACT_ID;
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
  const [contractId] = useState(getInitialContract);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [arbiter, setArbiter] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<string | null>(null);
  const [walletConnecting, setWalletConnecting] = useState(false);
  const [walletNetwork, setWalletNetwork] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const toastTimer = useRef<number | null>(null);

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
    const interval = window.setInterval(
      () => setNow(Math.floor(Date.now() / 1000)),
      1_000,
    );
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
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
      setWallet(access.address);
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
    setWallet(null);
    setWalletNetwork(null);
    showToast({ type: "info", message: "Cerraste sesión." });
  }

  function copyValue(value: string, label: string) {
    void navigator.clipboard
      .writeText(value)
      .then(() => showToast({ type: "info", message: `${label} copiado.` }))
      .catch(() =>
        showToast({ type: "error", message: "No se pudo copiar al portapapeles." }),
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

  const normalizedWallet = wallet?.toUpperCase() ?? null;
  const role: Role =
    normalizedWallet && agreement
      ? normalizedWallet === agreement.tenant.toUpperCase()
        ? "tenant"
        : normalizedWallet === agreement.landlord.toUpperCase()
          ? "landlord"
          : normalizedWallet === arbiter?.toUpperCase()
            ? "arbiter"
            : "viewer"
      : "viewer";

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
          <a className="brand" href="#top" aria-label="Depósito Seguro, inicio">
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
            <a className="header-link" href="#ayuda">
              Ayuda
            </a>
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
