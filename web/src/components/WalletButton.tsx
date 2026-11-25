import { Loader2, LogIn, LogOut } from "lucide-react";

interface WalletButtonProps {
  address: string | null;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function WalletButton({
  address,
  connecting,
  onConnect,
  onDisconnect,
}: WalletButtonProps) {
  if (address) {
    return (
      <div className="wallet-pill" title={address}>
        <span className="wallet-pill__dot" />
        <span className="wallet-pill__label">Mi cuenta</span>
        <span className="wallet-pill__address">•••• {address.slice(-4)}</span>
        <button
          type="button"
          className="wallet-pill__disconnect"
          onClick={onDisconnect}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
        >
          <LogOut size={14} strokeWidth={1.8} />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="button button--wallet"
      onClick={onConnect}
      disabled={connecting}
    >
      {connecting ? (
        <Loader2 size={16} className="spin" />
      ) : (
        <LogIn size={16} strokeWidth={1.8} />
      )}
      {connecting ? "Ingresando" : "Ingresar"}
    </button>
  );
}
