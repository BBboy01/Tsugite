import { defineConfig, mergeConfig } from "vite";
import config from "../vite.config";

export default mergeConfig(
  config,
  defineConfig({
    envDir: false,
    define: { "import.meta.env.VITE_WS_URL": JSON.stringify("ws://127.0.0.1:3003/ws") },
    server: { host: "127.0.0.1", port: 5175, strictPort: true },
  }),
);
