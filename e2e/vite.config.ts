import { defineConfig, mergeConfig } from "vite";
import config from "../vite.config";

const serverPort = Number(process.env.E2E_SERVER_PORT ?? 3003);
const webPort = Number(process.env.E2E_WEB_PORT ?? 5175);

export default mergeConfig(
  config,
  defineConfig({
    envDir: false,
    define: { "import.meta.env.VITE_WS_URL": JSON.stringify(`ws://127.0.0.1:${serverPort}/ws`) },
    server: { host: "127.0.0.1", port: webPort, strictPort: true },
  }),
);
