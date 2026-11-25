import { Check, Circle, Clock3, Gavel } from "lucide-react";
import type { Agreement } from "../lib/stellar";
import { formatDate } from "../lib/stellar";

interface TimelineProps {
  agreement: Agreement;
  now: number;
}

interface StepProps {
  label: string;
  detail: string;
  state: "done" | "current" | "future" | "alert";
  last?: boolean;
}

function Step({ label, detail, state, last = false }: StepProps) {
  const Icon =
    state === "done" ? Check : state === "alert" ? Gavel : state === "current" ? Clock3 : Circle;

  return (
    <li className={`timeline__step timeline__step--${state}${last ? " timeline__step--last" : ""}`}>
      <span className="timeline__marker" aria-hidden="true">
        <Icon size={13} strokeWidth={2} />
      </span>
      <div className="timeline__body">
        <span className="timeline__label">{label}</span>
        <span className="timeline__detail">{detail}</span>
      </div>
    </li>
  );
}

export function Timeline({ agreement, now }: TimelineProps) {
  const funded = agreement.status !== "AwaitingFunds";
  const leaseEnded = now >= Number(agreement.lease_end);
  const claimOpen = now >= Number(agreement.claim_deadline);
  const disputed = agreement.status === "Disputed";
  const closed = agreement.status === "Closed";

  return (
    <section className="panel timeline-panel" aria-labelledby="timeline-title">
      <header className="panel__header">
        <div>
          <p className="panel__kicker">Qué sigue</p>
          <h2 id="timeline-title">Línea de tiempo</h2>
        </div>
        <span className="panel__index">02</span>
      </header>

      <ol className="timeline">
        <Step
          label="Depósito en custodia"
          detail={funded ? "Depositado por el inquilino" : "Esperando al inquilino"}
          state={funded ? "done" : "current"}
        />
        <Step
          label="Fin del alquiler"
          detail={formatDate(agreement.lease_end)}
          state={leaseEnded ? "done" : "future"}
        />
        <Step
          label="Plazo para reclamar"
          detail={
            closed
              ? "El acuerdo se cerró con un reparto"
              : disputed
                ? "En pausa por un reclamo"
                : claimOpen
                  ? "El inquilino puede reclamar"
                  : `Se abre el ${formatDate(agreement.claim_deadline)}`
          }
          state={
            closed || claimOpen
              ? "done"
              : disputed
                ? "future"
                : leaseEnded
                  ? "current"
                  : "future"
          }
          last={!disputed && !closed}
        />
        {disputed && (
          <Step
            label="Reclamo abierto"
            detail="El mediador debe resolver"
            state="alert"
            last
          />
        )}
        {closed && (
          <Step
            label="Acuerdo cerrado"
            detail="El depósito ya fue repartido"
            state="done"
            last
          />
        )}
      </ol>

      {disputed && (
        <p className="timeline__note">
          Un reclamo abierto pausa la devolución automática. El mediador decide
          cuánto vuelve al inquilino.
        </p>
      )}
    </section>
  );
}
