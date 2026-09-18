import type { FileLanguage } from "./project";

export const DEFAULT_FILES: Array<{
  path: string;
  language: FileLanguage;
  source: string;
}> = [
  {
    path: "package.json",
    language: "javascript",
    source: `{
  "name": "tsugite-room",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0"
  },
  "dependencies": {
    "react": "19.3.0",
    "react-dom": "19.3.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "4.3.3",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.1.1",
    "tailwindcss": "4.3.3",
    "typescript": "7.0.2",
    "vite": "8.3.0"
  },
  "overrides": {
    "rolldown": "1.2.8"
  },
  "resolutions": {
    "rolldown": "1.2.8"
  },
  "pnpm": {
    "overrides": {
      "rolldown": "1.2.8"
    }
  }
}`,
  },
  {
    path: "pnpm-workspace.yaml",
    language: "javascript",
    source: "packages:\n  - .\noverrides:\n  rolldown: 1.2.8\n",
  },
  {
    path: "index.html",
    language: "javascript",
    source: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Tsugite React workspace</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>`,
  },
  {
    path: "src/App.tsx",
    language: "typescript",
    source: `import { useState } from "react";

export function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-2xl">
        <p className="text-sm font-medium uppercase tracking-[0.24em] text-cyan-300">
          Tsugite workspace
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">React + TypeScript + Vite</h1>
        <p className="mt-4 max-w-xl text-slate-300">
          This starter project is shared with everyone in the room and styled with Tailwind CSS.
        </p>
        <button
          className="mt-8 rounded-lg bg-cyan-400 px-4 py-2 font-medium text-slate-950 transition hover:bg-cyan-300"
          type="button"
          onClick={() => setCount((value) => value + 1)}
        >
          Count is {count}
        </button>
      </div>
    </main>
  );
}`,
  },
  {
    path: "src/index.css",
    language: "javascript",
    source: `@import "tailwindcss";

:root {
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  color-scheme: dark;
  background: #020617;
}

body {
  min-width: 320px;
  margin: 0;
}`,
  },
  {
    path: "src/main.tsx",
    language: "typescript",
    source: `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);`,
  },
  {
    path: "tsconfig.json",
    language: "javascript",
    source: `{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vite/client"]
  },
  "include": ["src", "vite.config.ts"]
}`,
  },
  {
    path: "vite.config.ts",
    language: "typescript",
    source: `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});`,
  },
];
