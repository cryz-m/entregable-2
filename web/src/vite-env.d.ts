/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RPC_URL?: string;
  readonly VITE_NETWORK_PASSPHRASE?: string;
  readonly VITE_CONTRACT_ID?: string;
  readonly VITE_READ_SOURCE?: string;
  readonly VITE_TOKEN_ID?: string;
  readonly VITE_MEDIATOR_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
