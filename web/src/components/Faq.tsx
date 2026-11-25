import { ArrowUpRight, Plus } from "lucide-react";

export function Faq() {
  return (
    <section className="faq shell" id="ayuda" aria-labelledby="faq-title">
      <div className="faq__intro">
        <p className="eyebrow">Antes de empezar</p>
        <h2 id="faq-title">Preguntas frecuentes</h2>
        <p>
          Lo importante, sin vueltas. Si algo no está claro, revisá esta guía
          antes de depositar.
        </p>
      </div>

      <div className="faq__list">
        <details>
          <summary>
            <span>¿Cómo creo un acuerdo para otra persona?</span>
            <Plus size={17} />
          </summary>
          <div className="faq__answer">
            <p>
              En <strong>Mis acuerdos → Crear acuerdo</strong> ingresás la
              cuenta Varial del inquilino, el depósito y la fecha de fin. La app
              crea el acuerdo y te da un enlace de invitación. La otra persona
              lo abre, ingresa y el acuerdo se guarda solo en su cuenta.
            </p>
          </div>
        </details>

        <details>
          <summary>
            <span>¿Necesito una cuenta especial?</span>
            <Plus size={17} />
          </summary>
          <div className="faq__answer">
            <p>
              Sí. Necesitás Varial, una cuenta digital gratuita que se instala
              como extensión en tu navegador. La usás para ingresar y confirmar
              cada operación.
            </p>
            <a
              className="help-link"
              href="https://varialwallet.com"
              target="_blank"
              rel="noreferrer"
            >
              Descargar Varial
              <ArrowUpRight size={13} />
            </a>
          </div>
        </details>

        <details>
          <summary>
            <span>¿Quién tiene mi depósito mientras tanto?</span>
            <Plus size={17} />
          </summary>
          <div className="faq__answer">
            <p>
              Queda en un acuerdo neutral, no en la cuenta del arrendador. Solo
              sale cuando se cumple una de las reglas: acuerdo entre las partes,
              devolución a los 15 días o decisión de un mediador.
            </p>
          </div>
        </details>

        <details>
          <summary>
            <span>¿Cuándo recupero mi depósito?</span>
            <Plus size={17} />
          </summary>
          <div className="faq__answer">
            <p>
              Si no hay ningún reclamo, 15 días después de terminar el alquiler
              podés reclamarlo completo. La página te muestra la fecha exacta.
            </p>
          </div>
        </details>

        <details>
          <summary>
            <span>¿Qué pasa si el arrendador reclama daños?</span>
            <Plus size={17} />
          </summary>
          <div className="faq__answer">
            <p>
              Puede presentar fotos, inventario o presupuestos. Un mediador
              neutral revisa el caso y decide cuánto corresponde. Nada se
              descuenta de forma automática.
            </p>
          </div>
        </details>

        <details>
          <summary>
            <span>¿Varial es seguro?</span>
            <Plus size={17} />
          </summary>
          <div className="faq__answer">
            <p>
              Tus claves quedan en tu dispositivo. Esta página nunca las recibe
              ni las guarda. Tratá tu frase de recuperación como la llave de tu
              casa: no la compartas.
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}
