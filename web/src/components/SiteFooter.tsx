import { ArrowUpRight } from "lucide-react";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__top">
        <div>
          <span className="site-footer__brand">Depósito Seguro</span>
          <p className="site-footer__note">
            Una forma neutral de cuidar el depósito de garantía de un alquiler.
            Reglas claras para inquilinos y arrendadores.
          </p>
        </div>
        <div className="site-footer__links">
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#ayuda">Preguntas frecuentes</a>
          <a href="https://varialwallet.com" target="_blank" rel="noreferrer">
            Descargar Varial
            <ArrowUpRight size={12} />
          </a>
        </div>
      </div>

      <div className="site-footer__bottom">
        <span>© 2026 Depósito Seguro · Costa Rica</span>
        <span>Servicio en etapa de prueba</span>
      </div>
    </footer>
  );
}
