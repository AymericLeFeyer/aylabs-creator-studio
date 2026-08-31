/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** URL de base de l'API. Vide en dev : Vite proxifie `/api`. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
