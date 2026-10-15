import * as ts from "typescript-legacy";
import { createEditorTypeScriptEnvironment } from "./typescript-environment";
import type {
  EditorIntelligence,
  IntelligenceDiagnostic,
  IntelligenceDiagnosticQuery,
  IntelligenceFile,
  IntelligenceLocation,
  IntelligenceQuery,
  IntelligenceResult,
} from "./editor-intelligence";

const absolute = (path: string) => `/${path.replace(/^\//, "")}`;
const sourceFile = (path: string) => /\.[cm]?[jt]sx?$/.test(path) || path.endsWith("package.json");
const display = (parts: readonly { text: string }[] | undefined) =>
  parts?.map((part) => part.text).join("") ?? "";
const range = (span: ts.TextSpan) => ({ from: span.start, to: span.start + span.length });

export function createTypeScriptIntelligence(
  path: string,
  source: string,
  files: readonly IntelligenceFile[] = [],
  libraries: readonly IntelligenceFile[] = [],
): EditorIntelligence {
  const environment = createEditorTypeScriptEnvironment(path, source, files, libraries);
  const service = environment.languageService;
  const sources = new Map(
    files.filter((file) => sourceFile(file.path)).map((file) => [absolute(file.path), file.text]),
  );
  sources.set(absolute(path), source);
  let disposed = false;
  let revision = 0;
  const pending = new Map<string, Set<{ cancelled: boolean }>>();
  const listeners = new Set<() => void>();

  async function run<T>(
    query: IntelligenceQuery | IntelligenceDiagnosticQuery | undefined,
    action: () => T | undefined,
  ): Promise<IntelligenceResult<T>> {
    if (disposed) return { status: "disposed" };
    const token = { cancelled: false };
    const requestId = query?.requestId;
    if (requestId !== undefined) {
      const tokens = pending.get(requestId) ?? new Set();
      tokens.add(token);
      pending.set(requestId, tokens);
    }
    const deadline = performance.now() + (query?.timeoutMs ?? 2000);
    try {
      // Yield before compilation so callers can cancel a queued query.
      await Promise.resolve();
      if (disposed) return { status: "disposed" };
      if (token.cancelled) return { status: "cancelled" };
      if (performance.now() >= deadline) return { status: "timeout" };
      if (query && (!Number.isFinite(query.timeoutMs ?? 2000) || (query.timeoutMs ?? 2000) < 0))
        return { status: "error", message: "Invalid query timeout" };
      if (
        query &&
        "position" in query &&
        (!Number.isInteger(query.position) ||
          query.position < 0 ||
          query.position > (sources.get(absolute(query.path))?.length ?? Infinity))
      )
        return { status: "error", message: "Invalid UTF-16 query position" };
      if (query && !sources.has(absolute(query.path))) return { status: "empty" };
      if (query?.revision !== undefined && query.revision !== revision)
        return { status: "cancelled" };
      const value = action();
      if (disposed) return { status: "disposed" };
      if (token.cancelled) return { status: "cancelled" };
      if (performance.now() >= deadline) return { status: "timeout" };
      return value === undefined || (Array.isArray(value) && !value.length)
        ? { status: "empty" }
        : { status: "ok", value };
    } catch (error) {
      return {
        status: "error",
        message: error instanceof Error ? error.message : "Language query failed",
      };
    } finally {
      if (requestId !== undefined) {
        const tokens = pending.get(requestId);
        tokens?.delete(token);
        if (!tokens?.size) pending.delete(requestId);
      }
    }
  }

  function locations(
    results: readonly { fileName: string; textSpan: ts.TextSpan }[] | undefined,
  ): IntelligenceLocation[] {
    const seen = new Set<string>();
    return (results ?? []).flatMap(({ fileName, textSpan }) => {
      const text = sources.get(fileName);
      const { start, length } = textSpan;
      const key = `${fileName}:${start}:${length}`;
      if (text === undefined || start < 0 || start + length > text.length || seen.has(key))
        return [];
      seen.add(key);
      const prefix = text.slice(0, start);
      return [
        {
          path: fileName.slice(1),
          ...range(textSpan),
          line: prefix.split("\n").length,
          column: start - prefix.lastIndexOf("\n"),
          source: text,
        },
      ];
    });
  }

  function publish(file: IntelligenceFile) {
    if (!sourceFile(file.path)) return;
    const filePath = absolute(file.path);
    if (sources.get(filePath) === file.text) return;
    environment.createFile(filePath, file.text);
    sources.set(filePath, file.text);
    revision++;
  }

  return {
    get workspaceVersion() {
      return revision;
    },
    subscribeWorkspace(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    syncWorkspace: (workspaceFiles) =>
      run(undefined, () => {
        const previous = revision;
        const next = new Set(
          workspaceFiles.filter((file) => sourceFile(file.path)).map((file) => absolute(file.path)),
        );
        for (const oldPath of sources.keys()) {
          if (next.has(oldPath)) continue;
          environment.deleteFile(oldPath);
          sources.delete(oldPath);
          revision++;
        }
        workspaceFiles.forEach(publish);
        if (revision !== previous) listeners.forEach((listener) => listener());
        return revision;
      }),
    updateFile: (file) =>
      run(undefined, () => {
        const previous = revision;
        publish(file);
        if (revision !== previous) listeners.forEach((listener) => listener());
        return null;
      }),
    hover: (query) =>
      run(query, () => {
        const info = service.getQuickInfoAtPosition(absolute(query.path), query.position);
        return (
          info && {
            ...range(info.textSpan),
            signature: display(info.displayParts),
            documentation: display(info.documentation).trim(),
          }
        );
      }),
    completion: (query) =>
      run(query, () => {
        const completions = service.getCompletionsAtPosition(
          absolute(query.path),
          query.position,
          {},
        );
        return completions?.entries.map((entry) => {
          const replacement = entry.replacementSpan ?? completions.optionalReplacementSpan;
          return {
            name: entry.name,
            kind: entry.kind,
            sortText: entry.sortText,
            ...(entry.insertText === undefined ? {} : { insertText: entry.insertText }),
            ...(replacement ? { replacement: range(replacement) } : {}),
          };
        });
      }),
    signatureHelp: (query) =>
      run(query, () => {
        const help = service.getSignatureHelpItems(absolute(query.path), query.position, undefined);
        return (
          help && {
            signatures: help.items.map((item) => ({
              prefix: display(item.prefixDisplayParts),
              suffix: display(item.suffixDisplayParts),
              separator: display(item.separatorDisplayParts),
              documentation: display(item.documentation),
              parameters: item.parameters.map((parameter) => ({
                label: display(parameter.displayParts),
                documentation: display(parameter.documentation),
              })),
            })),
            activeSignature: help.selectedItemIndex,
            activeParameter: help.argumentIndex,
          }
        );
      }),
    diagnostics: (query) =>
      run(query, () =>
        [
          ...service.getSyntacticDiagnostics(absolute(query.path)),
          ...service.getSemanticDiagnostics(absolute(query.path)),
        ].map((diagnostic): IntelligenceDiagnostic => ({
          from: diagnostic.start ?? 0,
          to: (diagnostic.start ?? 0) + (diagnostic.length ?? 0),
          code: diagnostic.code,
          severity: (["warning", "error", "suggestion", "message"] as const)[diagnostic.category],
          message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        })),
      ),
    definition: (query) =>
      run(query, () =>
        locations(service.getDefinitionAtPosition(absolute(query.path), query.position)),
      ),
    typeDefinition: (query) =>
      run(query, () =>
        locations(service.getTypeDefinitionAtPosition(absolute(query.path), query.position)),
      ),
    implementation: (query) =>
      run(query, () =>
        locations(service.getImplementationAtPosition(absolute(query.path), query.position)),
      ),
    references: (query) =>
      run(query, () =>
        locations(service.getReferencesAtPosition(absolute(query.path), query.position)),
      ),
    cancel(requestId) {
      pending.get(requestId)?.forEach((token) => {
        token.cancelled = true;
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      service.dispose();
      pending.clear();
      sources.clear();
      listeners.clear();
    },
  };
}
