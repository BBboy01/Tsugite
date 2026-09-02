import Babel from "@babel/standalone";

export type PreviewOutput = {
  level: "log" | "warn" | "error";
  message: string;
};

export function transpileSource(source: string, language: "typescript" | "javascript"): string {
  const result = Babel.transform(source, {
    presets: language === "typescript" ? ["typescript"] : [],
    sourceType: "script",
  });
  return result.code ?? "";
}

export function createPreviewDocument(code: string): string {
  const safeCode = JSON.stringify(code).replace(/<\//g, "<\\/");

  return `<!doctype html>
<html>
  <head><meta charset="UTF-8"><style>body{margin:0;padding:32px;font:16px/1.6 system-ui,sans-serif;color:#27322b}#app{max-width:640px;margin:auto}</style></head>
  <body><div id="app"></div><script>
    (() => {
      const source = ${safeCode};
      const send = (level, args) => parent.postMessage({ source: 'iris-preview', level, message: args.map(String).join(' ') }, '*');
      console.log = (...args) => send('log', args);
      console.warn = (...args) => send('warn', args);
      window.onerror = (message) => send('error', [message]);
      try { (0, eval)(source); } catch (error) { send('error', [error instanceof Error ? error.message : error]); }
    })();
  </script></body>
</html>`;
}

export function runPreview(
  source: string,
  language: "typescript" | "javascript",
): { code?: string; error?: string } {
  try {
    return { code: transpileSource(source, language) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
