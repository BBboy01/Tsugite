import { defineConfig } from "vite";
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import wasm from "vite-plugin-wasm";

export default defineConfig({
  root: "apps/web",
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "apps/web/src"),
      // codemirror-ts executes the TypeScript language service in the browser.
      // Keep that runtime on the compatible legacy build while tsc uses 7.0.2.
      typescript: path.resolve(import.meta.dirname, "node_modules/typescript-legacy"),
    },
  },
  plugins: [react(), tailwindcss(), wasm()],
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
