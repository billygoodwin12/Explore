/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SERVER_URL?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_EXPLORER_URL?: string;
  readonly VITE_DESK_A?: string;
  readonly VITE_DESK_B?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
