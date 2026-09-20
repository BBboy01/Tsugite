import Babel from "@babel/standalone";

export type PreviewOutput = {
  level: "log" | "warn" | "error";
  message: string;
};

export type PreviewSyntaxLocation = { line: number; column: number; offset: number };
export type PreviewSyntaxError = { message: string; location?: PreviewSyntaxLocation };

function describeSyntaxError(error: unknown): PreviewSyntaxError {
  const message = error instanceof Error ? error.message : String(error);
  if (!error || typeof error !== "object" || !("loc" in error)) return { message };
  const loc = error.loc as { line?: unknown; column?: unknown; index?: unknown } | null;
  if (
    !loc ||
    typeof loc.line !== "number" ||
    !Number.isInteger(loc.line) ||
    loc.line < 1 ||
    typeof loc.column !== "number" ||
    !Number.isInteger(loc.column) ||
    loc.column < 0 ||
    typeof loc.index !== "number" ||
    !Number.isInteger(loc.index) ||
    loc.index < 0
  )
    return { message };
  return { message, location: { line: loc.line, column: loc.column + 1, offset: loc.index } };
}

export function transpileSource(source: string, language: "typescript" | "javascript"): string {
  const result = Babel.transform(source, {
    presets: language === "typescript" ? ["typescript"] : [],
    sourceType: "script",
  });
  return result?.code ?? "";
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
): { code?: string; error?: string; location?: PreviewSyntaxLocation } {
  try {
    return { code: transpileSource(source, language) };
  } catch (error) {
    const detail = describeSyntaxError(error);
    return { error: detail.message, location: detail.location };
  }
}

export function validateSourceSyntax(
  source: string,
  language: "typescript" | "javascript",
): string | undefined {
  return validateSourceSyntaxDetails(source, language)?.message;
}

export function validateSourceSyntaxDetails(
  source: string,
  language: "typescript" | "javascript",
  path?: string,
): PreviewSyntaxError | undefined {
  if (path && !/\.[cm]?[jt]sx?$/i.test(path)) return undefined;
  try {
    Babel.transform(source, {
      parserOpts: {
        plugins: language === "typescript" ? ["typescript", "jsx"] : ["jsx"],
      },
    });
    return undefined;
  } catch (error) {
    return describeSyntaxError(error);
  }
}
