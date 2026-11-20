import type { IntelligenceFile } from "./editor-intelligence";
import { parseDeclarationScan } from "./typescript-declarations";
import type { RuntimeContainer, RuntimeProcess } from "./webcontainer-runtime";
import {
  DECLARATION_SCAN_LIMITS,
  type DeclarationScanLimits,
} from "./declaration-scan-limits";
import { scanNodeDeclarations } from "./declaration-scan-node";
import { createDeclarationReferenceReader } from "./declaration-scan-references";

const READY_MARKER = "IRIS_DECLARATION_SCAN_READY:";

export function createDeclarationScanScript(
  limits: DeclarationScanLimits = DECLARATION_SCAN_LIMITS,
): string {
  // Serialized functions receive every non-global dependency explicitly, including after minification.
  const source = `process.stdout.write(${JSON.stringify(READY_MARKER)});
(${scanNodeDeclarations.toString()})({
  fs: require("node:fs").promises, constants: require("node:fs").constants,
  path: require("node:path"), buffer: Buffer, cwd: process.cwd(),
  sourceArgument: process.argv[1], now: Date.now
}, ${JSON.stringify(limits)}, (${createDeclarationReferenceReader.toString()}))
.then(files => process.stdout.write(JSON.stringify({ status: "ok", files })))
.catch(error => process.stdout.write(JSON.stringify({ status: "disabled", reason: String(error.message || "Declaration scan failed").slice(0, ${limits.reasonLength}) })));`;
  // WebContainer unescapes spawn arguments; encode only trusted code, with sources as a separate argument.
  return `eval(Buffer.from("${encodeBase64(source)}", "base64").toString("utf8"));`;
}

export const DECLARATION_SCAN_SCRIPT = createDeclarationScanScript();

export async function scanWebContainerDeclarations(
  container: RuntimeContainer,
  sources: readonly IntelligenceFile[] | undefined,
  signal: AbortSignal,
  spawnTimeoutMs: number,
  timeoutMs: number,
): Promise<IntelligenceFile[]> {
  let process: RuntimeProcess | undefined;
  let reader: ReadableStreamDefaultReader<string> | undefined;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancelled = Promise.withResolvers<never>();
  const abort = () => {
    process?.kill();
    cancelled.reject(new Error("TypeScript declaration scan cancelled"));
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted)
      throw new Error("TypeScript declaration scan cancelled");
    const script =
      timeoutMs === DECLARATION_SCAN_LIMITS.deadlineMs
        ? DECLARATION_SCAN_SCRIPT
        : createDeclarationScanScript({
            ...DECLARATION_SCAN_LIMITS,
            deadlineMs: timeoutMs,
          });
    const args = ["-e", script];
    if (sources) args.push(serializeSources(sources));
    const deadline = Promise.withResolvers<never>();
    const expire = () =>
      deadline.reject(new Error("TypeScript declaration scan timed out"));
    timer = setTimeout(expire, spawnTimeoutMs);
    process = await Promise.race([
      container.spawn("node", args).then((spawned) => {
        if (finished || signal.aborted) spawned.kill();
        return spawned;
      }),
      cancelled.promise,
      deadline.promise,
    ]);
    clearTimeout(timer);
    if (signal.aborted)
      throw new Error("TypeScript declaration scan cancelled");
    timer = setTimeout(expire, spawnTimeoutMs);
    reader = process.output.getReader();
    const output = collectOutput(reader, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(expire, timeoutMs);
    });
    const exit = process.exit.then((code) => {
      if (code !== 0)
        throw new Error(`TypeScript declaration scan exit ${code}`);
    });
    const [text] = await Promise.race([
      Promise.all([output, exit]),
      cancelled.promise,
      deadline.promise,
    ]);
    if (signal.aborted)
      throw new Error("TypeScript declaration scan cancelled");
    return parseDeclarationScan(text);
  } catch (error) {
    process?.kill();
    throw error;
  } finally {
    finished = true;
    if (timer) clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    void reader?.cancel().catch(() => {});
  }
}

function serializeSources(sources: readonly IntelligenceFile[]): string {
  const limits = DECLARATION_SCAN_LIMITS;
  if (!Array.isArray(sources) || sources.length > limits.sourceFiles) {
    throw new Error("TypeScript declaration source request limit exceeded");
  }
  const encoder = new TextEncoder();
  let bytes = 0;
  const requestFiles = sources.map((file) => {
    if (
      !file ||
      typeof file.text !== "string" ||
      typeof file.path !== "string" ||
      file.path.length > limits.pathLength ||
      file.text.length > limits.sourceFileBytes
    ) {
      throw new Error("TypeScript declaration source request limit exceeded");
    }
    const size = encoder.encode(file.text).byteLength;
    bytes += size;
    if (size > limits.sourceFileBytes || bytes > limits.sourceTotalBytes) {
      throw new Error("TypeScript declaration source request limit exceeded");
    }
    return { path: file.path, text: file.text };
  });
  const request = JSON.stringify(requestFiles);
  if (encoder.encode(request).byteLength > limits.sourceRequestBytes) {
    throw new Error("TypeScript declaration source request limit exceeded");
  }
  const encoded = encodeBase64(request);
  if (encoded.length > limits.sourceRequestBytes) {
    throw new Error("TypeScript declaration source request limit exceeded");
  }
  return encoded;
}

function encodeBase64(text: string): string {
  const utf8 = new TextEncoder().encode(text);
  const chunks: string[] = [];
  for (let offset = 0; offset < utf8.length; offset += 32768) {
    chunks.push(String.fromCharCode(...utf8.subarray(offset, offset + 32768)));
  }
  return btoa(chunks.join(""));
}

async function collectOutput(
  reader: ReadableStreamDefaultReader<string>,
  ready: () => void,
): Promise<string> {
  const limits = DECLARATION_SCAN_LIMITS;
  const chunks: string[] = [];
  let bytes = 0;
  const encoder = new TextEncoder();
  let prefix = "";
  let started = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return prefix + chunks.join("");
      if (
        typeof result.value !== "string" ||
        result.value.length > limits.outputBytes
      ) {
        throw new Error("TypeScript declaration output limit exceeded");
      }
      bytes += encoder.encode(result.value).byteLength;
      if (bytes > limits.outputBytes || chunks.length >= limits.outputChunks) {
        throw new Error("TypeScript declaration output limit exceeded");
      }
      if (!started) {
        prefix += result.value;
        if (READY_MARKER.startsWith(prefix) && prefix !== READY_MARKER)
          continue;
        started = true;
        ready();
        chunks.push(
          prefix.startsWith(READY_MARKER)
            ? prefix.slice(READY_MARKER.length)
            : prefix,
        );
        prefix = "";
      } else chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
}
