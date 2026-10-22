/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend API root, default /api (same origin: Vite proxy locally, the backend in Docker). */
  readonly VITE_API_BASE_URL?: string;
  /** "true" to use the in-memory mock instead of the backend. */
  readonly VITE_USE_MOCK_API?: string;
  /** "1" to turn on the document PDF (preview, download, print screen). Off by default, see docs/pdf.md. */
  readonly VITE_PDF?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The app version from package.json (see docs/versioning.md), injected by vite.config.ts. */
declare const __APP_VERSION__: string;

/** The git commit the app was built from, or "" in local development. Injected by vite.config.ts. */
declare const __APP_COMMIT__: string;
