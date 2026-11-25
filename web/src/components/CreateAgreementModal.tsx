import {
  ArrowRight,
  Check,
  Copy,
  Loader2,
  MessageCircle,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";

interface CreateAgreementInput {
  tenant: string;
  amount: string;
  leaseEnd: string;
}

interface CreateAgreementModalProps {
  wallet: string;
  mediator: string;
  creating: boolean;
  onCreate: (
    input: CreateAgreementInput,
  ) => Promise<{ ok: boolean; error?: string; contractId?: string }>;
  onClose: () => void;
  onOpen: (contractId: string) => void;
}

function defaultLeaseEnd(): string {
  const date = new Date();
  date.setDate(date.getDate() + 30);
  return date.toISOString().slice(0, 10);
}

export function CreateAgreementModal({
  wallet,
  mediator,
  creating,
  onCreate,
  onClose,
  onOpen,
}: CreateAgreementModalProps) {
  const [tenant, setTenant] = useState("");
  const [amount, setAmount] = useState("100");
  const [leaseEnd, setLeaseEnd] = useState(defaultLeaseEnd);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!createdId) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [createdId]);

  const inviteUrl = createdId
    ? `${window.location.origin}${window.location.pathname}?contract=${createdId}&invite=1`
    : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const result = await onCreate({
      tenant: tenant.trim().toUpperCase(),
      amount,
      leaseEnd,
    });
    if (!result.ok || !result.contractId) {
      setError(result.error || "No se pudo crear el acuerdo.");
      return;
    }
    setCreatedId(result.contractId);
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("No se pudo copiar el enlace. Copialo manualmente.");
    }
  }

  const shareText = encodeURIComponent(
    `Te comparto el acuerdo para el depósito de garantía del alquiler: ${inviteUrl}`,
  );

  return (
    <div className="modal-backdrop" onClick={creating ? undefined : onClose}>
      <section
        className="modal create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="modal__close"
          onClick={onClose}
          aria-label="Cerrar"
          disabled={creating}
        >
          <X size={18} />
        </button>

        {createdId ? (
          <>
            <div className="modal__mark modal__mark--success" aria-hidden="true">
              <Check size={22} />
            </div>
            <p className="modal__kicker">Acuerdo creado</p>
            <h2 id="create-title">Mandale el enlace al inquilino</h2>
            <p className="modal__lead">
              El acuerdo ya está en tu cuenta. La otra persona abre este enlace,
              ingresa con Varial y queda vinculada automáticamente.
            </p>

            <label className="field">
              <span>Enlace de invitación</span>
              <input
                type="text"
                className="mono"
                value={inviteUrl}
                readOnly
                onFocus={(event) => event.currentTarget.select()}
              />
            </label>

            <div className="create-success__actions">
              <button
                type="button"
                className="button button--primary"
                onClick={copyInvite}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? "Copiado" : "Copiar enlace"}
              </button>
              <a
                className="button button--outline"
                href={`https://wa.me/?text=${shareText}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={15} />
                Compartir por WhatsApp
              </a>
            </div>

            <button
              type="button"
              className="button button--ghost button--wide"
              onClick={() => onOpen(createdId)}
            >
              Abrir el acuerdo
              <ArrowRight size={15} />
            </button>
            <button type="button" className="modal__skip" onClick={onClose}>
              Listo
            </button>
          </>
        ) : (
          <>
            <div className="modal__mark" aria-hidden="true">
              <ShieldCheck size={22} />
            </div>
            <p className="modal__kicker">Nuevo acuerdo</p>
            <h2 id="create-title">Crear un acuerdo</h2>
            <p className="modal__lead">
              Tu cuenta (•••• {wallet.slice(-4)}) queda como arrendador. El
              inquilino no necesita firmar ahora: solo abre el enlace después y
              deposita cuando corresponda.
            </p>

            <form className="create-form" onSubmit={submit}>
              <label className="field">
                <span>Cuenta del inquilino</span>
                <input
                  type="text"
                  className="mono"
                  value={tenant}
                  onChange={(event) => setTenant(event.target.value)}
                  placeholder="G…"
                  spellCheck={false}
                  required
                />
                <small>
                  Pedile que copie su identificador desde Varial. Empieza con G.
                </small>
              </label>

              <div className="create-form__row">
                <label className="field">
                  <span>Depósito (XLM)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder="100"
                    required
                  />
                </label>
                <label className="field">
                  <span>Fin del alquiler</span>
                  <input
                    type="date"
                    value={leaseEnd}
                    min={new Date(Date.now() + 86_400_000)
                      .toISOString()
                      .slice(0, 10)}
                    onChange={(event) => setLeaseEnd(event.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="create-form__mediator">
                <span>Mediador neutral</span>
                <strong>Depósito Seguro</strong>
                <small className="mono">•••• {mediator.slice(-4)}</small>
              </div>

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                className="button button--primary button--wide"
                disabled={creating}
              >
                {creating ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}
                {creating ? "Creando acuerdo…" : "Crear acuerdo"}
              </button>
              <p className="action-note">
                Varial te va a pedir confirmar. El depósito todavía no se mueve:
                el inquilino lo hace después desde su cuenta.
              </p>
            </form>
          </>
        )}
      </section>
    </div>
  );
}
