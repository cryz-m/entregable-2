import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock3,
  Download,
  FileCheck2,
  Gavel,
  Loader2,
  Plus,
  RefreshCw,
  Scale,
  ShieldCheck,
  UploadCloud,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { Agreement } from "../lib/stellar";
import {
  formatAmount,
  formatDate,
  hexFromBytes,
  timeLeft,
} from "../lib/stellar";

export type Role = "tenant" | "landlord" | "arbiter" | "viewer";

interface ActionPanelProps {
  agreement: Agreement;
  arbiter: string | null;
  wallet: string | null;
  role: Role;
  now: number;
  busy: string | null;
  saved: boolean;
  onSave: () => void;
  onFund: () => void;
  onClaim: () => void;
  onDispute: (hash: string) => void;
  onResolve: (tenantRefund: bigint) => void;
  onConnect: () => void;
  onHelp: () => void;
  onRefresh: () => void;
}

const ROLE_LABEL: Record<Role, string> = {
  tenant: "Inquilino",
  landlord: "Arrendador",
  arbiter: "Mediador",
  viewer: "Visitante",
};

function Spinner() {
  return <Loader2 size={16} className="spin" />;
}

function Note({ children }: { children: ReactNode }) {
  return <p className="action-note">{children}</p>;
}

export function ActionPanel({
  agreement,
  arbiter,
  wallet,
  role,
  now,
  busy,
  saved,
  onSave,
  onFund,
  onClaim,
  onDispute,
  onResolve,
  onConnect,
  onHelp,
  onRefresh,
}: ActionPanelProps) {
  const [evidenceHash, setEvidenceHash] = useState("");
  const [evidenceName, setEvidenceName] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [refundPct, setRefundPct] = useState(50);

  const status = agreement.status;
  const amount = formatAmount(agreement.amount);
  const nowSeconds = now;
  const leaseEnd = Number(agreement.lease_end);
  const claimDeadline = Number(agreement.claim_deadline);
  const claimOpen = nowSeconds >= claimDeadline;
  const inDisputeWindow = nowSeconds >= leaseEnd && nowSeconds < claimDeadline;
  const disputed = status === "Disputed";
  const tenantRefund = (agreement.amount * BigInt(refundPct)) / 100n;

  useEffect(() => {
    setLocalError(null);
  }, [status, role, wallet]);

  useEffect(() => {
    setRefundPct(50);
  }, [agreement.amount, status]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setLocalError(null);
    try {
      const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
      setEvidenceHash(hexFromBytes(new Uint8Array(digest)));
      const size =
        file.size > 1024 * 1024
          ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.max(1, Math.round(file.size / 1024))} KB`;
      setEvidenceName(`${file.name} · ${size}`);
    } catch {
      setLocalError("No se pudo leer el archivo. Probá con otro.");
    }
  }

  function submitDispute() {
    if (!evidenceHash) {
      setLocalError("Primero adjuntá una foto, un inventario o un presupuesto.");
      return;
    }
    setLocalError(null);
    onDispute(evidenceHash);
  }

  function submitResolve() {
    setLocalError(null);
    onResolve(tenantRefund);
  }

  function renderRoleHeader() {
    return (
      <div className={`role-card role-card--${role}`}>
        <div className="role-card__icon">
          {role === "viewer" ? (
            <ShieldCheck size={18} strokeWidth={1.7} />
          ) : role === "arbiter" ? (
            <Scale size={18} strokeWidth={1.7} />
          ) : (
            <Check size={18} strokeWidth={2} />
          )}
        </div>
        <div>
          <span className="role-card__label">Estás como {ROLE_LABEL[role]}</span>
          <p>
            {role === "viewer"
              ? "Esta cuenta no es parte del acuerdo, pero puede consultar el estado."
              : role === "tenant"
                ? "Solo vos podés depositar o reclamar el depósito."
                : role === "landlord"
                  ? "Solo vos podés presentar un reclamo."
                  : "Solo vos podés resolver un reclamo abierto."}
          </p>
        </div>
      </div>
    );
  }

  function renderConnectPrompt() {
    return (
      <div className="action-block connect-prompt">
        <div className="closed-mark">
          <Wallet size={19} strokeWidth={1.8} />
        </div>
        <h3>Ingresá con tu cuenta</h3>
        <p>
          Para depositar, reclamar o resolver un reclamo necesitás ingresar con
          Varial. También podés leer todo el acuerdo sin ingresar.
        </p>
        <button type="button" className="button button--primary button--wide" onClick={onConnect}>
          <Wallet size={16} />
          Ingresar
        </button>
        <button type="button" className="help-cta" onClick={onHelp}>
          <Download size={13} />
          ¿Cómo descargar Varial?
        </button>
        <Note>
          Varial es una cuenta digital gratuita. Tus claves quedan en tu
          dispositivo y esta página nunca las recibe.
        </Note>
      </div>
    );
  }

  function renderAwaitingFunds() {
    if (role === "tenant") {
      return (
        <div className="action-block">
          <h3>Falta tu depósito</h3>
          <p>
            El acuerdo está listo. Al depositar, los {amount} XLM salen de tu
            cuenta y quedan protegidos hasta que se cumpla una regla.
          </p>
          <button
            type="button"
            className="button button--primary button--wide"
            onClick={onFund}
            disabled={Boolean(busy)}
          >
            {busy === "fund" ? <Spinner /> : <ArrowRight size={16} />}
            {busy === "fund" ? "Depositando…" : `Depositar ${amount} XLM`}
          </button>
          <Note>
            Varial te va a pedir confirmar la operación. El depósito no se mueve
            hasta que una regla lo autorice.
          </Note>
        </div>
      );
    }

    return (
      <div className="action-block action-block--muted">
        <h3>Esperando el depósito</h3>
        <p>
          El inquilino todavía no depositó. Cuando lo haga, el acuerdo pasa a
          estar <strong>Vigente</strong>.
        </p>
        <div className="waiting-line">
          <Clock3 size={16} />
          <span>Cuenta •••• {agreement.tenant.slice(-4)}</span>
        </div>
      </div>
    );
  }

  function renderActive() {
    if (role === "tenant") {
      return (
        <div className="action-block">
          <h3>{claimOpen ? "El plazo ya se cumplió" : "Tu depósito está cubierto"}</h3>
          <p>
            {claimOpen
              ? "Pasaron 15 días desde el fin del alquiler y no hay reclamos. Podés recuperar el depósito completo."
              : "Si el arrendador no presenta un reclamo antes del plazo, vas a poder reclamar el depósito completo."}
          </p>
          {!claimOpen && (
            <div className="countdown">
              <span className="countdown__label">Reclamo disponible en</span>
              <strong>{timeLeft(agreement.claim_deadline, now)}</strong>
              <span className="countdown__date">
                {formatDate(agreement.claim_deadline)}
              </span>
            </div>
          )}
          <button
            type="button"
            className="button button--primary button--wide"
            onClick={onClaim}
            disabled={Boolean(busy) || !claimOpen}
          >
            {busy === "claim" ? <Spinner /> : <ArrowRight size={16} />}
            {busy === "claim"
              ? "Reclamando…"
              : claimOpen
                ? `Reclamar ${amount} XLM`
                : "Todavía no disponible"}
          </button>
          {!claimOpen && (
            <Note>
              El plazo se calcula desde el fin del alquiler, no desde el día en
              que te mudás.
            </Note>
          )}
        </div>
      );
    }

    if (role === "landlord") {
      if (!inDisputeWindow) {
        return (
          <div className="action-block">
            <h3>
              {nowSeconds < leaseEnd
                ? "El alquiler sigue vigente"
                : "El plazo para reclamar venció"}
            </h3>
            <p>
              {nowSeconds < leaseEnd
                ? `Podés presentar un reclamo desde el ${formatDate(agreement.lease_end)} si hay daños o incumplimientos.`
                : "Pasaron los 15 días. El inquilino puede reclamar el depósito completo."}
            </p>
            <div className="waiting-line">
              <Clock3 size={16} />
              <span>
                {nowSeconds < leaseEnd
                  ? `Faltan ${timeLeft(agreement.lease_end, now)}`
                  : "Sin acciones pendientes para el arrendador"}
              </span>
            </div>
          </div>
        );
      }

      return (
        <div className="action-block">
          <h3>¿Hay daños que justifiquen un descuento?</h3>
          <p>
            Presentá un reclamo antes del {formatDate(agreement.claim_deadline)}.
            Un mediador neutral decide el reparto; no se descuenta nada
            automáticamente.
          </p>

          <label className="dropzone">
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(event) => handleFile(event.target.files?.[0])}
            />
            <span className="dropzone__icon">
              {evidenceHash ? <FileCheck2 size={20} /> : <UploadCloud size={20} />}
            </span>
            <span className="dropzone__title">
              {evidenceName || "Subí fotos, inventario o presupuesto"}
            </span>
            <span className="dropzone__hint">
              {evidenceHash
                ? "Documento listo. Tocá para cambiarlo."
                : "El archivo queda en tu dispositivo. Solo se guarda una huella para verificarlo."}
            </span>
          </label>

          {localError && (
            <p className="form-error" role="alert">
              <AlertTriangle size={14} /> {localError}
            </p>
          )}

          <button
            type="button"
            className="button button--danger button--wide"
            onClick={submitDispute}
            disabled={Boolean(busy) || !evidenceHash}
          >
            {busy === "dispute" ? <Spinner /> : <Gavel size={16} />}
            {busy === "dispute" ? "Presentando reclamo…" : "Presentar reclamo"}
          </button>
          <Note>
            El documento queda en tu poder. Un mediador neutral va a revisar el
            caso antes de mover el depósito.
          </Note>
        </div>
      );
    }

    if (role === "arbiter") {
      return (
        <div className="action-block action-block--muted">
          <h3>No hay reclamos abiertos</h3>
          <p>
            El mediador solo puede actuar cuando el arrendador presenta un
            reclamo. Mientras tanto, el acuerdo sigue su curso normal.
          </p>
          <div className="waiting-line">
            <Scale size={16} />
            <span>Tu rol es neutral: no podés depositar ni reclamar.</span>
          </div>
        </div>
      );
    }

    return (
      <div className="action-block action-block--muted">
        <h3>{wallet ? "Esta cuenta no es parte del acuerdo" : "Ingresá con tu cuenta"}</h3>
        <p>
          {wallet
            ? "Ingresá con la cuenta del inquilino, del arrendador o del mediador para realizar una acción."
            : "La cuenta del inquilino, del arrendador o del mediador puede actuar sobre este acuerdo."}
        </p>
        <button type="button" className="button button--outline" onClick={onConnect}>
          <Wallet size={16} />
          {wallet ? "Ingresar con otra cuenta" : "Ingresar"}
        </button>
      </div>
    );
  }

  function renderDisputed() {
    if (role === "arbiter") {
      return (
        <div className="action-block">
          <h3>Resolver el reclamo</h3>
          <p>
            Elegí cuánto vuelve al inquilino. El resto va al arrendador. La
            decisión es final y mueve el depósito en el mismo paso.
          </p>

          {agreement.evidence && (
            <div className="evidence-chip">
              <FileCheck2 size={15} />
              <span>El arrendador adjuntó un documento de respaldo</span>
            </div>
          )}

          <div className="split-control">
            <div className="split-control__labels">
              <span>
                Inquilino <strong>{formatAmount(tenantRefund)} XLM</strong>
              </span>
              <span>
                Arrendador{" "}
                <strong>{formatAmount(agreement.amount - tenantRefund)} XLM</strong>
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="1"
              value={refundPct}
              onChange={(event) => setRefundPct(Number(event.target.value))}
              aria-label="Porcentaje del depósito que vuelve al inquilino"
            />
            <div className="split-control__bar" aria-hidden="true">
              <span style={{ width: `${refundPct}%` }} />
            </div>
            <span className="split-control__pct">{refundPct}% al inquilino</span>
          </div>

          <button
            type="button"
            className="button button--primary button--wide"
            onClick={submitResolve}
            disabled={Boolean(busy)}
          >
            {busy === "resolve" ? <Spinner /> : <Scale size={16} />}
            {busy === "resolve" ? "Resolviendo…" : "Resolver reclamo"}
          </button>
          <Note>
            Al confirmar, el depósito se reparte entre las dos partes y el
            acuerdo queda cerrado. No hay una segunda instancia.
          </Note>
        </div>
      );
    }

    return (
      <div className="action-block">
        <h3>Reclamo en revisión</h3>
        <p>
          El arrendador presentó un reclamo con documentos. La devolución
          automática está en pausa hasta que el mediador resuelva.
        </p>
        {agreement.evidence && (
          <div className="evidence-chip">
            <FileCheck2 size={15} />
            <span>Documento de respaldo adjunto</span>
          </div>
        )}
        <div className="waiting-line">
          <Clock3 size={16} />
          <span>Esperando la decisión del mediador</span>
        </div>
      </div>
    );
  }

  function renderClosed() {
    return (
      <div className="action-block action-block--muted">
        <div className="closed-mark">
          <Check size={20} strokeWidth={2.2} />
        </div>
        <h3>El acuerdo está cerrado</h3>
        <p>
          El depósito ya fue repartido entre las dos partes. Gracias por usar
          un acuerdo claro.
        </p>
        <a className="button button--outline" href="#top">
          Volver al inicio
        </a>
      </div>
    );
  }

  return (
    <aside className="panel action-panel" id="acciones" aria-labelledby="actions-title">
      <header className="panel__header">
        <div>
          <p className="panel__kicker">Según tu rol</p>
          <h2 id="actions-title">Acciones</h2>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={onRefresh}
          aria-label="Actualizar estado"
          title="Actualizar estado"
        >
          <RefreshCw size={15} />
        </button>
      </header>

      {!wallet ? (
        renderConnectPrompt()
      ) : (
        <>
          {renderRoleHeader()}
          {role !== "viewer" && (
            <div className="save-agreement">
              {saved ? (
                <span className="save-agreement__done">
                  <Check size={13} />
                  Guardado en mi cuenta
                </span>
              ) : (
                <button type="button" className="help-cta" onClick={onSave}>
                  <Plus size={13} />
                  Guardar en mi cuenta
                </button>
              )}
            </div>
          )}
          {status === "AwaitingFunds" && renderAwaitingFunds()}
          {status === "Active" && renderActive()}
          {status === "Disputed" && renderDisputed()}
          {status === "Closed" && renderClosed()}
        </>
      )}

      {arbiter && (
        <footer className="action-panel__footer">
          <Scale size={13} />
          Mediador: <span className="mono">•••• {arbiter.slice(-4)}</span>
        </footer>
      )}
    </aside>
  );
}
