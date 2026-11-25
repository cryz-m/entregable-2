import { ArrowRight, Download, Loader2, ShieldCheck, X } from "lucide-react";
import { useEffect } from "react";

interface VarialHelpProps {
  open: boolean;
  connecting: boolean;
  onClose: () => void;
  onRetry: () => void;
}

export function VarialHelp({
  open,
  connecting,
  onClose,
  onRetry,
}: VarialHelpProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="varial-help-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="modal__close"
          onClick={onClose}
          aria-label="Cerrar ayuda"
        >
          <X size={18} />
        </button>

        <div className="modal__mark" aria-hidden="true">
          <ShieldCheck size={22} strokeWidth={1.7} />
        </div>
        <p className="modal__kicker">Tu cuenta digital</p>
        <h2 id="varial-help-title">Ingresá con Varial</h2>
        <p className="modal__lead">
          Varial guarda tu cuenta y confirma las operaciones desde tu navegador.
          Es gratuita y no compartís tus claves con esta página.
        </p>

        <ol className="help-steps">
          <li>
            <span className="help-steps__number">1</span>
            <div>
              <strong>Descargá Varial</strong>
              <p>Se instala como una extensión en tu navegador de escritorio.</p>
              <a
                className="help-link"
                href="https://varialwallet.com"
                target="_blank"
                rel="noreferrer"
              >
                <Download size={14} />
                Descargar Varial
              </a>
            </div>
          </li>
          <li>
            <span className="help-steps__number">2</span>
            <div>
              <strong>Creá o abrí tu cuenta</strong>
              <p>
                Guardá tu frase de recuperación en un lugar privado. No la
                compartas con nadie.
              </p>
            </div>
          </li>
          <li>
            <span className="help-steps__number">3</span>
            <div>
              <strong>Volvé a esta página</strong>
              <p>
                Tocá “Ya lo instalé” y autorizá el acceso. Varial te va a pedir
                confirmación cuando deposites o reclames.
              </p>
            </div>
          </li>
        </ol>

        <button
          type="button"
          className="button button--primary button--wide"
          onClick={onRetry}
          disabled={connecting}
          autoFocus
        >
          {connecting ? <Loader2 size={16} className="spin" /> : <ArrowRight size={16} />}
          {connecting ? "Verificando…" : "Ya lo instalé"}
        </button>
        <button type="button" className="modal__skip" onClick={onClose}>
          Seguir sin ingresar
        </button>

        <p className="modal__note">
          ¿Ya lo tenés instalado y no responde? Abrilo, desbloquealo y volvé a
          intentar.
        </p>
      </section>
    </div>
  );
}
