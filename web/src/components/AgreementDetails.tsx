import {
  CalendarClock,
  Copy,
  Coins,
  Scale,
  UserRound,
} from "lucide-react";
import type { Agreement } from "../lib/stellar";
import { NATIVE_TOKEN_ID, formatAmount, formatDate } from "../lib/stellar";

interface AgreementDetailsProps {
  agreement: Agreement;
  arbiter: string | null;
  wallet: string | null;
  onCopy: (value: string, label: string) => void;
}

function Party({
  label,
  address,
  wallet,
  onCopy,
}: {
  label: string;
  address: string | null;
  wallet: string | null;
  onCopy: (value: string, label: string) => void;
}) {
  const isYou = Boolean(address && wallet && address === wallet);
  return (
    <div className="party">
      <div className="party__icon" aria-hidden="true">
        <UserRound size={18} strokeWidth={1.6} />
      </div>
      <div className="party__body">
        <span className="party__label">
          {label}
          {isYou && <span className="party__you">Vos</span>}
        </span>
        {address ? (
          <button
            type="button"
            className="address-button"
            onClick={() => onCopy(address, `Cuenta de ${label.toLowerCase()}`)}
            title={address}
            aria-label={`Copiar cuenta de ${label.toLowerCase()}`}
          >
            <span className="party__account">
              Cuenta •••• {address.slice(-4)}
            </span>
            <Copy size={12} />
          </button>
        ) : (
          <span className="muted">Sin asignar</span>
        )}
      </div>
    </div>
  );
}

export function AgreementDetails({
  agreement,
  arbiter,
  wallet,
  onCopy,
}: AgreementDetailsProps) {
  const isNative = agreement.token === NATIVE_TOKEN_ID;

  return (
    <section className="panel dossier-panel" aria-labelledby="agreement-title">
      <header className="panel__header">
        <div>
          <p className="panel__kicker">Resumen del acuerdo</p>
          <h2 id="agreement-title">El acuerdo</h2>
        </div>
        <span className="panel__index">01</span>
      </header>

      <div className="dossier-amount">
        <div>
          <span className="dossier-amount__label">Depósito en custodia</span>
          <strong className="dossier-amount__value">
            {formatAmount(agreement.amount)}
            <span className="dossier-amount__unit">
              {isNative ? "XLM" : "moneda"}
            </span>
          </strong>
        </div>
        <div className="dossier-amount__token">
          <Coins size={15} strokeWidth={1.7} />
          {isNative ? "Moneda: XLM" : "Moneda del acuerdo"}
          {!isNative && (
            <button
              type="button"
              className="address-button address-button--inline"
              onClick={() => onCopy(agreement.token, "Moneda del acuerdo")}
              title={agreement.token}
            >
              <span className="mono">•••• {agreement.token.slice(-4)}</span>
              <Copy size={11} />
            </button>
          )}
        </div>
      </div>

      <div className="party-list">
        <Party
          label="Inquilino"
          address={agreement.tenant}
          wallet={wallet}
          onCopy={onCopy}
        />
        <Party
          label="Arrendador"
          address={agreement.landlord}
          wallet={wallet}
          onCopy={onCopy}
        />
        <div className="party party--arbiter">
          <div className="party__icon" aria-hidden="true">
            <Scale size={18} strokeWidth={1.6} />
          </div>
          <div className="party__body">
            <span className="party__label">
              Mediador
              <span className="party__note">solo revisa reclamos</span>
            </span>
            {arbiter ? (
              <button
                type="button"
                className="address-button"
                onClick={() => onCopy(arbiter, "Cuenta del mediador")}
                title={arbiter}
                aria-label="Copiar cuenta del mediador"
              >
                <span className="party__account">
                  Cuenta •••• {arbiter.slice(-4)}
                </span>
                <Copy size={12} />
              </button>
            ) : (
              <span className="muted">Sin asignar</span>
            )}
          </div>
        </div>
      </div>

      <dl className="date-list">
        <div>
          <dt>
            <CalendarClock size={14} strokeWidth={1.7} />
            Fin del alquiler
          </dt>
          <dd>{formatDate(agreement.lease_end)}</dd>
        </div>
        <div>
          <dt>
            <CalendarClock size={14} strokeWidth={1.7} />
            Plazo para reclamar
          </dt>
          <dd>{formatDate(agreement.claim_deadline)}</dd>
        </div>
      </dl>
    </section>
  );
}
