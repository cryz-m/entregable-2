import type { Status } from "../lib/stellar";
import { STATUS_META } from "../lib/status";

export function StatusPill({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  return (
    <span className={`status-pill status-pill--${meta.tone}`}>
      <span className="status-pill__dot" />
      {meta.label}
    </span>
  );
}
