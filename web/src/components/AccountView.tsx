import {
  ArrowLeft,
  ArrowRight,
  Copy,
  ExternalLink,
  Gavel,
  Loader2,
  Plus,
  Scale,
  Share2,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import type { Agreement } from "../lib/stellar";
import { NATIVE_TOKEN_ID, formatAmount, formatDate } from "../lib/stellar";
import type { Role } from "./ActionPanel";
import { CreateAgreementModal } from "./CreateAgreementModal";
import { StatusPill } from "./StatusPill";

export interface SavedSummary {
  contractId: string;
  agreement: Agreement | null;
  arbiter: string | null;
  role: Role;
  error?: string;
}

interface AccountViewProps {
  wallet: string | null;
  mediator: string;
  summaries: SavedSummary[];
  loading: boolean;
  creating: boolean;
  onOpen: (contractId: string) => void;
  onRemove: (contractId: string) => void;
  onShare: (contractId: string) => void;
  onAdd: (input: string) => Promise<{ ok: boolean; error?: string }>;
  onCreate: (input: {
    tenant: string;
    amount: string;
    leaseEnd: string;
  }) => Promise<{ ok: boolean; error?: string; contractId?: string }>;
  onConnect: () => void;
  onSwitchAccount: () => void;
  onCopyAccount: () => void;
  onHelp: () => void;
  onBack: () => void;
}

const ROLE_META: Record<Role, { label: string; icon: typeof UserRound }> = {
  tenant: { label: "Inquilino", icon: UserRound },
  landlord: { label: "Arrendador", icon: UsersRound },
  arbiter: { label: "Mediador", icon: Scale },
  viewer: { label: "Sin rol", icon: ShieldCheck },
};

const GROUPS: Array<{ role: Role; title: string; description: string }> = [
  {
    role: "tenant",
    title: "Como inquilino",
    description: "Acuerdos donde tu cuenta depositó la garantía.",
  },
  {
    role: "landlord",
    title: "Como arrendador",
    description: "Acuerdos donde tu cuenta recibe o reclama el depósito.",
  },
  {
    role: "arbiter",
    title: "Como mediador",
    description: "Acuerdos donde tu cuenta revisa reclamos.",
  },
];

function roleMeta(role: Role) {
  return ROLE_META[role];
}

function counterparty(summary: SavedSummary): string {
  const { agreement, role } = summary;
  if (!agreement) return "";
  if (role === "tenant") {
    return `Arrendador •••• ${agreement.landlord.slice(-4)}`;
  }
  if (role === "landlord") {
    return `Inquilino •••• ${agreement.tenant.slice(-4)}`;
  }
  if (role === "arbiter") {
    return `Inquilino •••• ${agreement.tenant.slice(-4)} · Arrendador •••• ${agreement.landlord.slice(-4)}`;
  }
  return "Tu cuenta no participa en este acuerdo";
}

function AgreementCard({
  summary,
  onOpen,
  onRemove,
  onShare,
}: {
  summary: SavedSummary;
  onOpen: (contractId: string) => void;
  onRemove: (contractId: string) => void;
  onShare: (contractId: string) => void;
}) {
  const Icon = roleMeta(summary.role).icon;

  if (summary.error || !summary.agreement) {
    return (
      <article className="account-card account-card--error">
        <div className="account-card__top">
          <span className="role-chip">
            <ShieldCheck size={13} />
            No disponible
          </span>
          <button
            type="button"
            className="icon-button"
            onClick={() => onRemove(summary.contractId)}
            aria-label="Quitar acuerdo de mi cuenta"
            title="Quitar de mi cuenta"
          >
            <Trash2 size={14} />
          </button>
        </div>
        <h3>No pudimos leer este acuerdo</h3>
        <p>{summary.error || "Puede que el acuerdo ya no esté disponible."}</p>
      </article>
    );
  }

  const { agreement } = summary;
  return (
    <article className="account-card">
      <div className="account-card__top">
        <span className="role-chip">
          <Icon size={13} strokeWidth={1.8} />
          {roleMeta(summary.role).label}
        </span>
        <div className="account-card__tools">
          <StatusPill status={agreement.status} />
          <button
            type="button"
            className="icon-button"
            onClick={() => onShare(summary.contractId)}
            aria-label="Copiar enlace de invitación"
            title="Compartir acuerdo"
          >
            <Share2 size={14} />
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={() => onRemove(summary.contractId)}
            aria-label="Quitar acuerdo de mi cuenta"
            title="Quitar de mi cuenta"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="account-card__amount">
        <span>Depósito</span>
        <strong>
          {formatAmount(agreement.amount)}{" "}
          {agreement.token === NATIVE_TOKEN_ID ? "XLM" : "moneda"}
        </strong>
      </div>

      <p className="account-card__counterparty">{counterparty(summary)}</p>

      <dl className="account-card__dates">
        <div>
          <dt>Fin del alquiler</dt>
          <dd>{formatDate(agreement.lease_end)}</dd>
        </div>
        <div>
          <dt>Plazo para reclamar</dt>
          <dd>{formatDate(agreement.claim_deadline)}</dd>
        </div>
      </dl>

      <button
        type="button"
        className="button button--outline account-card__open"
        onClick={() => onOpen(summary.contractId)}
      >
        Abrir acuerdo
        <ArrowRight size={15} />
      </button>
    </article>
  );
}

export function AccountView({
  wallet,
  mediator,
  summaries,
  loading,
  creating,
  onOpen,
  onRemove,
  onShare,
  onAdd,
  onCreate,
  onConnect,
  onSwitchAccount,
  onCopyAccount,
  onHelp,
  onBack,
}: AccountViewProps) {
  const [input, setInput] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setAdding(true);
    try {
      const result = await onAdd(input);
      if (!result.ok) {
        setError(result.error || "No se pudo agregar el acuerdo.");
        return;
      }
      setInput("");
    } finally {
      setAdding(false);
    }
  }

  if (!wallet) {
    return (
      <section className="account shell">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeft size={14} />
          Volver al ejemplo
        </button>
        <div className="account-gate">
          <div className="account-gate__mark" aria-hidden="true">
            <ShieldCheck size={24} />
          </div>
          <p className="eyebrow">Tu cuenta</p>
          <h1>Un lugar para tus acuerdos</h1>
          <p>
            Ingresá con Varial para ver los acuerdos que guardaste como
            inquilino, arrendador o mediador.
          </p>
          <div className="account-gate__actions">
            <button type="button" className="button button--primary" onClick={onConnect}>
              Ingresar
              <ArrowRight size={16} />
            </button>
            <button type="button" className="help-cta" onClick={onHelp}>
              ¿Cómo descargar Varial?
            </button>
          </div>
        </div>
      </section>
    );
  }

  const counts = {
    tenant: summaries.filter((item) => item.role === "tenant").length,
    landlord: summaries.filter((item) => item.role === "landlord").length,
    arbiter: summaries.filter((item) => item.role === "arbiter").length,
  };

  const visibleGroups = GROUPS.map((group) => ({
    ...group,
    items: summaries.filter((item) => item.role === group.role),
  })).filter((group) => group.items.length > 0);

  const unlinked = summaries.filter((item) => item.role === "viewer");

  return (
    <section className="account shell">
      <div className="account__top">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeft size={14} />
          Volver al ejemplo
        </button>
        <a className="text-link" href={window.location.href} target="_blank" rel="noreferrer">
          Abrir en ventana nueva
          <ExternalLink size={12} />
        </a>
      </div>

      <header className="account-hero">
        <div>
          <p className="eyebrow">Tu cuenta</p>
          <h1>Tus acuerdos, en un solo lugar.</h1>
          <p className="account-hero__lead">
            Podés ser inquilino en un acuerdo y arrendador en otro. Cada uno
            tiene su propio rol, sus fechas y sus reglas. En un mismo acuerdo,
            las partes siempre son cuentas distintas.
          </p>
        </div>
        <div className="account-identity">
          <span>Cuenta conectada</span>
          <strong>•••• {wallet.slice(-4)}</strong>
          <small>Los acuerdos se guardan en este navegador.</small>
          <button type="button" className="help-cta" onClick={onCopyAccount}>
            <Copy size={12} />
            Copiar mi identificador
          </button>
          <button type="button" className="help-cta" onClick={onSwitchAccount}>
            Cambiar de cuenta
          </button>
        </div>
      </header>

      <div className="account-stats">
        <div>
          <span>Como inquilino</span>
          <strong>{counts.tenant}</strong>
        </div>
        <div>
          <span>Como arrendador</span>
          <strong>{counts.landlord}</strong>
        </div>
        <div>
          <span>Como mediador</span>
          <strong>{counts.arbiter}</strong>
        </div>
      </div>

      <div className="account-cta">
        <div>
          <p className="panel__kicker">Nuevo alquiler</p>
          <h2>Creá el acuerdo y compartí el enlace.</h2>
          <p>
            Tu cuenta queda como arrendador. El inquilino abre el enlace, ingresa
            con Varial y el acuerdo aparece en su cuenta.
          </p>
        </div>
        <button
          type="button"
          className="button button--primary"
          onClick={() => setCreateOpen(true)}
        >
          <Plus size={15} />
          Crear acuerdo
        </button>
      </div>

      <details className="add-existing">
        <summary>
          <span>Ya me compartieron un acuerdo</span>
          <Plus size={16} />
        </summary>
        <form className="add-agreement" onSubmit={submit}>
          <div className="add-agreement__copy">
            <p className="panel__kicker">Sumar un acuerdo</p>
            <h2>Pegá el enlace que te compartieron</h2>
            <p>
              Solo se agrega si tu cuenta participa como inquilino, arrendador o
              mediador. Es el camino alternativo si el enlace no se guardó solo.
            </p>
          </div>
          <div className="add-agreement__form">
            <label htmlFor="agreement-link">Enlace del acuerdo</label>
            <div className="add-agreement__row">
              <input
                id="agreement-link"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Pegá el enlace completo"
                spellCheck={false}
              />
              <button
                type="submit"
                className="button button--primary"
                disabled={adding || !input.trim()}
              >
                {adding ? <Loader2 size={15} className="spin" /> : <Plus size={15} />}
                {adding ? "Agregando…" : "Agregar"}
              </button>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </form>
      </details>

      {loading ? (
        <div className="account-loading" role="status">
          <Loader2 size={18} className="spin" />
          Cargando tus acuerdos…
        </div>
      ) : summaries.length === 0 ? (
        <div className="account-empty">
          <div className="account-empty__mark">
            <UsersRound size={24} />
          </div>
          <h2>Todavía no hay acuerdos guardados</h2>
          <p>
            Creá el primero y compartí el enlace con el inquilino. Si ya te
            compartieron uno, abrilo y se guarda automáticamente.
          </p>
          <div className="account-empty__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={() => setCreateOpen(true)}
            >
              <Plus size={15} />
              Crear acuerdo
            </button>
            <button type="button" className="button button--outline" onClick={onBack}>
              Ver el ejemplo
            </button>
          </div>
        </div>
      ) : (
        <div className="account-groups">
          {visibleGroups.map((group) => (
            <section className="account-group" key={group.role}>
              <div className="account-group__header">
                <div>
                  <h2>{group.title}</h2>
                  <p>{group.description}</p>
                </div>
                <span className="account-group__count">{group.items.length}</span>
              </div>
              <div className="account-grid">
                {group.items.map((summary) => (
                  <AgreementCard
                    key={summary.contractId}
                    summary={summary}
                    onOpen={onOpen}
                    onRemove={onRemove}
                    onShare={onShare}
                  />
                ))}
              </div>
            </section>
          ))}

          {unlinked.length > 0 && (
            <section className="account-group">
              <div className="account-group__header">
                <div>
                  <h2>Sin rol en este acuerdo</h2>
                  <p>Estos acuerdos fueron guardados con otra cuenta.</p>
                </div>
                <span className="account-group__count">{unlinked.length}</span>
              </div>
              <div className="account-grid">
                {unlinked.map((summary) => (
                  <AgreementCard
                    key={summary.contractId}
                    summary={summary}
                    onOpen={onOpen}
                    onRemove={onRemove}
                    onShare={onShare}
                  />
                ))}
              </div>
            </section>
          )}

          <p className="account-note">
            <Gavel size={14} />
            Si una cuenta es inquilino y arrendador del mismo acuerdo, el
            acuerdo no se puede crear: las tres partes deben ser distintas.
            Podés usar cuentas separadas para clientes distintos.
          </p>
        </div>
      )}

      {createOpen && (
        <CreateAgreementModal
          wallet={wallet}
          mediator={mediator}
          creating={creating}
          onCreate={onCreate}
          onClose={() => setCreateOpen(false)}
          onOpen={onOpen}
        />
      )}
    </section>
  );
}
