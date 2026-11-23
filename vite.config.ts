import { defineConfig } from "vite";
import path from "node:path";
import { createRequire } from "node:module";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";

const webRequire = createRequire(
  new URL("./apps/web/package.json", import.meta.url),
);

export default defineConfig({
  root: "apps/web",
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "apps/web/src"),
      "@typescript-lib": path.join(
        path.dirname(webRequire.resolve("typescript-legacy/package.json")),
        "lib",
      ),
    },
  },
  plugins: [react(), tailwindcss(), wasm()],
  optimizeDeps: { include: ["typescript-legacy"] },
  worker: { format: "es" },
  server: {
    port: 5173,
    strictPort: false,
    host: "127.0.0.1",
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  build: {
    target: "esnext",
  },
});
