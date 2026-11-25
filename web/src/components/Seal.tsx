import { useId } from "react";
import type { Status } from "../lib/stellar";
import { STATUS_META } from "../lib/status";

interface SealProps {
  status: Status;
  compact?: boolean;
}

export function Seal({ status, compact = false }: SealProps) {
  const id = useId().replace(/:/g, "");
  const meta = STATUS_META[status];

  return (
    <div
      className={`seal seal--${meta.tone}${compact ? " seal--compact" : ""}`}
      aria-label={`Estado del depósito: ${meta.label}`}
    >
      <svg viewBox="0 0 200 200" role="img" aria-hidden="true">
        <defs>
          <path
            id={`seal-path-${id}`}
            d="M100,24 a76,76 0 1,1 -0.1,0"
          />
        </defs>
        <circle className="seal__ring" cx="100" cy="100" r="92" />
        <circle className="seal__ring seal__ring--inner" cx="100" cy="100" r="78" />
        <circle className="seal__ring seal__ring--dashed" cx="100" cy="100" r="62" />
        <text className="seal__orbit">
          <textPath href={`#seal-path-${id}`} startOffset="0%">
            DEPÓSITO SEGURO · ACUERDO DE ALQUILER · COSTA RICA ·
          </textPath>
        </text>
        <text className="seal__status" x="100" y="94" textAnchor="middle">
          {meta.short}
        </text>
        <text className="seal__small" x="100" y="116" textAnchor="middle">
          Bajo custodia
        </text>
        <circle className="seal__dot" cx="100" cy="134" r="2.6" />
      </svg>
    </div>
  );
}
