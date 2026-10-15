import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf-8"),
) as { version: string };

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // The app version from package.json and the git commit (the Docker
  // GIT_COMMIT build arg; unset in local development), shown in the sidebar.
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_COMMIT__: JSON.stringify(process.env.GIT_COMMIT ?? ""),
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // Not 5173, so it can run next to other local projects.
    port: 5180,
    strictPort: true,
    // Same origin as the backend dev server, so the session cookie just works.
    proxy: { "/api": "http://127.0.0.1:8010" },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Screen tests run against the in-memory mock, never a live backend.
    env: { VITE_USE_MOCK_API: "true" },
  },
});
