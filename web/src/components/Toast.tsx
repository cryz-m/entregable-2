import { CircleAlert, CircleCheck, Info, X } from "lucide-react";

export interface ToastState {
  id: number;
  type: "success" | "error" | "info";
  message: string;
  details?: string;
}

interface ToastProps {
  toast: ToastState;
  onClose: () => void;
}

export function Toast({ toast, onClose }: ToastProps) {
  const Icon =
    toast.type === "success"
      ? CircleCheck
      : toast.type === "error"
        ? CircleAlert
        : Info;

  return (
    <div
      className={`toast toast--${toast.type}`}
      role={toast.type === "error" ? "alert" : "status"}
      aria-live={toast.type === "error" ? "assertive" : "polite"}
    >
      <div className="toast__icon">
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <div className="toast__body">
        <p className="toast__message">{toast.message}</p>
        {toast.details && <p className="toast__details">{toast.details}</p>}
      </div>
      <button
        type="button"
        className="toast__close"
        onClick={onClose}
        aria-label="Cerrar notificación"
      >
        <X size={16} />
      </button>
    </div>
  );
}
