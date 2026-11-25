import type { Status } from "./stellar";

export interface StatusMeta {
  label: string;
  short: string;
  tone: "pending" | "active" | "disputed" | "closed";
  description: string;
}

export const STATUS_META: Record<Status, StatusMeta> = {
  AwaitingFunds: {
    label: "Por depositar",
    short: "Pendiente",
    tone: "pending",
    description: "El acuerdo está listo. Falta que el inquilino deposite.",
  },
  Active: {
    label: "Vigente",
    short: "Vigente",
    tone: "active",
    description: "El depósito está protegido y el alquiler sigue en curso.",
  },
  Disputed: {
    label: "En revisión",
    short: "Revisión",
    tone: "disputed",
    description: "El arrendador presentó un reclamo. Un mediador debe resolver.",
  },
  Closed: {
    label: "Cerrado",
    short: "Cerrado",
    tone: "closed",
    description: "El depósito ya fue repartido.",
  },
};
