import type { IntelligenceFile } from "./editor-intelligence";
import { DECLARATION_SCAN_OUTPUT_BYTES, parseDeclarationScan } from "./typescript-declarations";
import type { RuntimeContainer, RuntimeProcess } from "./webcontainer-runtime";

// Only built-in filesystem operations run in the container; source text is a separate JSON argument.
const declarationScanSource = String.raw`
process.stdout.write("IRIS_DECLARATION_SCAN_READY:");
const nodeFs = require("node:fs");
const fs = nodeFs.promises;
const path = require("node:path");
const limits = { files: 1024, fileBytes: 1048576, totalBytes: 8388608, metadataBytes: 65536, entries: 8192, outputBytes: 16777216 };
const deadline = Date.now() + 2000;
const files = [];
const filePaths = new Set();
const packageCopies = new Map();
const queue = [];
const sourceImports = new Map(), typedPackages = new Set(), ambientModules = new Set();
let root, modules, entries = 0, bytes = 0;
function check() { if (Date.now() >= deadline) throw new Error("Declaration read deadline exceeded"); }
function inside(base, target) { return target === base || target.startsWith(base + path.sep); }
function safeParts(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 1024 &&
    !/[\\:?#\x00-\x1f\x7f]/.test(value) &&
    value.split("/").every(part => part && part !== "." && part !== ".." && !part.startsWith(".env"));
}
function packageName(value, exact = false) {
  if (!safeParts(value)) throw new Error("Invalid declaration package path");
  const parts = value.split("/");
  const count = parts[0].startsWith("@") ? 2 : 1;
  if (parts.length < count || (count === 2 && parts[0] === "@") || (exact && parts.length !== count)) {
    throw new Error("Invalid declaration package path");
  }
  return parts.slice(0, count).join("/");
}
async function inspect(candidate, base) {
  check();
  if (!inside(base, candidate)) throw new Error("Declaration path outside workspace node_modules");
  const initial = await fs.lstat(candidate);
  if (initial.isSymbolicLink()) {
    const target = path.resolve(path.dirname(candidate), await fs.readlink(candidate));
    if (!inside(base, target)) throw new Error("Declaration path outside workspace node_modules");
    if (target.split(path.sep).some(part => part.startsWith(".env"))) throw new Error("Invalid declaration path");
  }
  let real;
  try { real = await fs.realpath(candidate); }
  catch (error) { if (initial.isSymbolicLink()) throw new Error("Invalid declaration symlink target"); throw error; }
  if (!inside(base, real)) throw new Error("Declaration path outside workspace node_modules");
  if (real.split(path.sep).some(part => part.startsWith(".env"))) throw new Error("Invalid declaration path");
  const stat = await fs.lstat(real);
  check();
  return { real, stat };
}
async function read(candidate, virtual, base, metadata) {
  const { real, stat } = await inspect(candidate, base);
  if (!stat.isFile()) throw new Error("Invalid declaration file kind");
  if (metadata ? path.basename(real) !== "package.json" : !/\.d\.(?:ts|mts|cts)$/.test(real)) {
    throw new Error("Invalid declaration file kind");
  }
  const cap = metadata ? limits.metadataBytes : limits.fileBytes;
  if (stat.size > cap) throw new Error("TypeScript declaration byte limit exceeded");
  if (filePaths.has(virtual)) return;
  if (files.length >= limits.files) throw new Error("TypeScript declaration file limit exceeded");
  if (bytes + stat.size > limits.totalBytes) throw new Error("TypeScript declaration workspace limit exceeded");
  const handle = await fs.open(real, nodeFs.constants.O_RDONLY | nodeFs.constants.O_NOFOLLOW);
  let text;
  try {
    const current = await handle.stat();
    if (!current.isFile() || current.size > cap) throw new Error("TypeScript declaration byte limit exceeded");
    const buffer = Buffer.alloc(Math.min(cap, current.size) + 1);
    let offset = 0;
    while (offset < buffer.length) {
      check();
      const result = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!result.bytesRead) break;
      offset += result.bytesRead;
    }
    if (offset > cap || offset > current.size) throw new Error("TypeScript declaration byte limit exceeded");
    text = buffer.subarray(0, offset).toString("utf8");
  } finally { await handle.close(); }
  check();
  const size = Buffer.byteLength(text);
  if (size > cap) throw new Error("TypeScript declaration byte limit exceeded");
  if (bytes + size > limits.totalBytes) throw new Error("TypeScript declaration workspace limit exceeded");
  let value;
  if (metadata) {
    value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid TypeScript package metadata");
    for (const field of ["types", "typings"]) {
      if (typeof value[field] === "string" && !safeParts(value[field].replace(/^\.\//, ""))) {
        throw new Error("Invalid declaration type entry");
      }
    }
  }
  files.push({ path: virtual, text }); filePaths.add(virtual); bytes += size;
  return metadata ? value : text;
}
function references(text, imports) {
  const names = new Set();
  const values = [];
  const starters = new Set(["class", "const", "export", "function", "import", "interface", "let", "return", "type", "var"]);
  function skipQuoted(source, start, quote) {
    let cursor = start + 1;
    while (cursor < source.length) {
      if (source[cursor] === "\\") cursor += 2;
      else if (source[cursor++] === quote) break;
    }
    return Math.min(cursor, source.length);
  }
  function templateExpressionEnd(source, start) {
    let depth = 1;
    let cursor = start;
    while (cursor < source.length) {
      const char = source[cursor];
      if (char === "'" || char === '"') cursor = skipQuoted(source, cursor, char);
      else if (char.charCodeAt(0) === 96) cursor = templateEnd(source, cursor).end;
      else if (source.startsWith("//", cursor)) {
        const end = source.indexOf("\n", cursor);
        cursor = end < 0 ? source.length : end + 1;
      } else if (source.startsWith("/*", cursor)) {
        const end = source.indexOf("*/", cursor + 2);
        cursor = end < 0 ? source.length : end + 2;
      } else if (char === "{") {
        depth++;
        cursor++;
      } else if (char === "}") {
        depth--;
        if (depth === 0) return cursor;
        cursor++;
      } else cursor++;
    }
    return source.length;
  }
  function templateEnd(source, start) {
    const expressions = [];
    let cursor = start + 1;
    while (cursor < source.length) {
      if (source[cursor] === "\\") cursor += 2;
      else if (source[cursor].charCodeAt(0) === 96) return { end: cursor + 1, expressions };
      else if (source.startsWith("\${", cursor)) {
        const expressionStart = cursor + 2;
        const expressionEnd = templateExpressionEnd(source, expressionStart);
        expressions.push(source.slice(expressionStart, expressionEnd));
        cursor = expressionEnd + 1;
      } else cursor++;
    }
    return { end: source.length, expressions };
  }
  const regexPrefixWords = new Set(["await", "case", "delete", "do", "else", "in", "instanceof", "of", "return", "throw", "typeof", "void", "yield"]);
  function regexCanStart(previous) {
    if (!previous) return true;
    if (previous.kind === "word") return regexPrefixWords.has(previous.value);
    return previous.kind === "punctuation" && "([{:;,=!?&|+-*%^~<>".includes(previous.value);
  }
  function skipRegex(source, start) {
    let cursor = start + 1;
    let inClass = false;
    while (cursor < source.length && source[cursor] !== "\n") {
      if (source[cursor] === "\\") cursor += 2;
      else if (source[cursor] === "[") { inClass = true; cursor++; }
      else if (source[cursor] === "]") { inClass = false; cursor++; }
      else if (source[cursor] === "/" && !inClass) {
        cursor++;
        while (/[A-Za-z]/.test(source[cursor] || "")) cursor++;
        return cursor;
      } else cursor++;
    }
    return cursor;
  }
  const tokens = [];
  let index = 0;
  let line = 0;
  while (index < text.length) {
    const char = text[index];
    if (/\s/.test(char)) { if (char === "\n") line++; index++; continue; }
    if (text.startsWith("//", index)) {
      const end = text.indexOf("\n", index);
      const comment = text.slice(index, end < 0 ? text.length : end);
      const directive = /^\/\/\/\s*<reference\b[^>\n]{0,1024}?\btypes\s*=\s*(["'])([^"']+)\1/.exec(comment);
      if (directive) values.push(directive[2]);
      index = end < 0 ? text.length : end;
      continue;
    }
    if (text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2);
      const stop = end < 0 ? text.length : end + 2;
      line += (text.slice(index, stop).match(/\n/g) || []).length;
      index = stop;
      continue;
    }
    if (char.charCodeAt(0) === 96) {
      const start = index;
      const template = templateEnd(text, index);
      for (const expression of template.expressions) {
        for (const name of references(expression)) names.add(name);
      }
      line += (text.slice(start, template.end).match(/\n/g) || []).length;
      index = template.end;
      continue;
    }
    if (char === "'" || char === '"') {
      const start = index;
      index = skipQuoted(text, start, char);
      tokens.push({ kind: "string", value: text.slice(start + 1, Math.max(start + 1, index - 1)), line });
      continue;
    }
    if (char === "/" && regexCanStart(tokens[tokens.length - 1])) {
      const start = index;
      index = skipRegex(text, index);
      line += (text.slice(start, index).match(/\n/g) || []).length;
      continue;
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(text.slice(index));
    if (word) {
      tokens.push({ kind: "word", value: word[0], line });
      index += word[0].length;
    } else {
      tokens.push({ kind: "punctuation", value: char, line });
      index++;
    }
  }
  function addFrom(index) {
    let depth = 0;
    for (let cursor = index + 1; cursor < tokens.length; cursor++) {
      check();
      const token = tokens[cursor];
      if (token.kind === "punctuation") {
        if (token.value === "{" || token.value === "[" || token.value === "(") depth++;
        else if (token.value === "}" || token.value === "]" || token.value === ")") depth--;
        else if (token.value === ";" && depth === 0) return;
      }
      if (depth === 0 && token.kind === "word" && starters.has(token.value) && token.line > tokens[cursor - 1].line) return;
      if (depth === 0 && token.kind === "word" && token.value === "from" && tokens[cursor + 1]?.kind === "string") {
        values.push(tokens[cursor + 1].value);
        return;
      }
    }
  }
  for (let index = 0; index < tokens.length; index++) {
    check();
    const token = tokens[index];
    if (token.kind !== "word") continue;
    if (token.value === "declare" && tokens[index + 1]?.value === "module" && tokens[index + 2]?.kind === "string") ambientModules.add(tokens[index + 2].value);
    if (token.value === "require" && tokens[index + 1]?.value === "(" && tokens[index + 2]?.kind === "string") {
      values.push(tokens[index + 2].value);
    } else if (token.value === "import") {
      if (tokens[index + 1]?.kind === "string") values.push(tokens[index + 1].value);
      else if (tokens[index + 1]?.value === "(" && tokens[index + 2]?.kind === "string") values.push(tokens[index + 2].value);
      else addFrom(index);
    } else if (token.value === "export") addFrom(index);
  }
  for (const value of values) {
    if (value.startsWith(".") || value.startsWith("node:") || value.startsWith("@/") || value.startsWith("#")) continue;
    const name = packageName(value); names.add(name);
    if (imports) imports.set(value, name);
    if (names.size > limits.entries) throw new Error("Declaration entry limit exceeded");
  }
  return names;
}
function companionName(name) { return "@types/" + (name.startsWith("@") ? name.slice(1).replace("/", "__") : name); }
function request(name, importer, ancestry = []) {
  queue.push({ name: packageName(name, true), importer, ancestry });
  if (!name.startsWith("@types/")) {
    queue.push({ name: companionName(name), importer, ancestry });
  }
  if (queue.length > limits.entries) throw new Error("Declaration entry limit exceeded");
}
async function resolvePackage(name, importer) {
  let directory = importer ? importer.real : root;
  while (inside(root, directory)) {
    const candidate = path.join(directory, "node_modules", name);
    if (inside(modules, candidate)) {
      try {
        const found = await inspect(candidate, modules);
        if (!found.stat.isDirectory()) throw new Error("Invalid declaration package kind");
        const virtual = directory === root ? "node_modules/" + name : importer.virtual + "/node_modules/" + name;
        return { real: found.real, virtual };
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    if (directory === root) break;
    directory = path.dirname(directory);
  }
}
async function walk(directory, virtual, names, seen) {
  check();
  const found = await inspect(directory, modules);
  if (seen.has(found.real)) throw new Error("Declaration directory symlink cycle");
  const nextSeen = new Set(seen); nextSeen.add(found.real);
  const iterator = await fs.opendir(found.real);
  for await (const entry of iterator) {
    check();
    if (++entries > limits.entries) throw new Error("Declaration entry limit exceeded");
    if (entry.name === "node_modules" || entry.name.startsWith(".env") || entry.name === ".git") continue;
    const declaration = /\.d\.(?:ts|mts|cts)$/.test(entry.name);
    const metadata = entry.name === "package.json";
    if (!entry.isDirectory() && !declaration && !metadata) continue;
    const candidate = path.join(found.real, entry.name);
    const target = await inspect(candidate, modules);
    const filePath = virtual + "/" + entry.name;
    if (!safeParts(filePath)) throw new Error("Invalid TypeScript declaration path");
    if (target.stat.isDirectory()) await walk(target.real, filePath, names, nextSeen);
    else if (declaration || metadata) {
      const text = await read(target.real, filePath, modules, metadata);
      if (!metadata) for (const name of references(text)) names.add(name);
    }
  }
}
const toolingPackages = new Set(["@tailwindcss/vite", "@vitejs/plugin-react", "tailwindcss", "typescript", "vite"]);
function isToolingPackage(name) { return toolingPackages.has(name); }
async function main() {
  root = await fs.realpath(process.cwd()); modules = path.join(root, "node_modules");
  const metadata = await read(path.join(root, "package.json"), "package.json", root, true);
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    if (metadata[field] && typeof metadata[field] === "object" && !Array.isArray(metadata[field])) {
      for (const name of Object.keys(metadata[field])) {
        if (field === "devDependencies" && isToolingPackage(name)) continue;
        request(name, undefined);
      }
    }
  }
  const sourceArgument = process.argv[1];
  if (sourceArgument) {
    if (Buffer.byteLength(sourceArgument) > 33554432) throw new Error("Declaration source request limit exceeded");
    const sources = JSON.parse(Buffer.from(sourceArgument, "base64").toString("utf8"));
    if (!Array.isArray(sources) || sources.length > 512) throw new Error("Invalid declaration source request");
    let sourceBytes = 0;
    for (const source of sources) {
      if (!source || typeof source.text !== "string" || source.text.length > 1048576) throw new Error("Invalid declaration source request");
      const size = Buffer.byteLength(source.text);
      sourceBytes += size;
      if (size > 1048576 || sourceBytes > 16777216) throw new Error("Declaration source request limit exceeded");
      const imports = references(source.text, source.path === "vite.config.ts" ? undefined : sourceImports);
      for (const name of imports) {
        if (source.path === "vite.config.ts" && isToolingPackage(name)) continue;
        request(name, undefined);
      }
    }
  }
  for (let index = 0; index < queue.length; index++) {
    check();
    const task = queue[index];
    const resolved = await resolvePackage(task.name, task.importer);
    if (!resolved) continue;
    if (task.ancestry.includes(resolved.real)) continue;
    const existing = packageCopies.get(resolved.real);
    if (existing && existing.has(resolved.virtual)) continue;
    if (!existing) packageCopies.set(resolved.real, new Set([resolved.virtual]));
    else existing.add(resolved.virtual);
    const names = new Set();
    const before = files.length;
    await walk(resolved.real, resolved.virtual, names, new Set());
    if (!task.importer && files.slice(before).some(file => /\.d\.(?:ts|mts|cts)$/.test(file.path))) typedPackages.add(task.name);
    const ancestry = [...task.ancestry, resolved.real];
    for (const name of names) request(name, resolved, ancestry);
  }
  for (const [specifier, name] of sourceImports) {
    const ambient = [...ambientModules].some(pattern => {
      const star = pattern.indexOf("*");
      return pattern === specifier || (star >= 0 && specifier.startsWith(pattern.slice(0, star)) && specifier.endsWith(pattern.slice(star + 1)));
    });
    if (!ambient && !typedPackages.has(name) && !typedPackages.has(companionName(name))) throw new Error("TypeScript declarations missing: " + name);
  }
  check();
  const output = JSON.stringify({ status: "ok", files });
  if (Buffer.byteLength(output) > limits.outputBytes) throw new Error("TypeScript declaration output limit exceeded");
  process.stdout.write(output);
}
main().catch(error => process.stdout.write(JSON.stringify({ status: "disabled", reason: String(error.message || "Declaration scan failed").slice(0, 1024) })));
`;

// WebContainer unescapes spawn arguments; encode the fixed trusted script before transport.
export const DECLARATION_SCAN_SCRIPT = `eval(Buffer.from("${btoa(declarationScanSource)}", "base64").toString("utf8"));`;

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
    if (signal.aborted) throw new Error("TypeScript declaration scan cancelled");
    const args = ["-e", DECLARATION_SCAN_SCRIPT];
    if (sources) args.push(serializeSources(sources));
    const deadline = Promise.withResolvers<never>();
    const expire = () => deadline.reject(new Error("TypeScript declaration scan timed out"));
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
    if (signal.aborted) throw new Error("TypeScript declaration scan cancelled");
    timer = setTimeout(expire, spawnTimeoutMs);
    reader = process.output.getReader();
    const output = collectOutput(reader, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(expire, timeoutMs);
    });
    const exit = process.exit.then((code) => {
      if (code !== 0) throw new Error(`TypeScript declaration scan exit ${code}`);
    });
    const [text] = await Promise.race([
      Promise.all([output, exit]),
      cancelled.promise,
      deadline.promise,
    ]);
    if (signal.aborted) throw new Error("TypeScript declaration scan cancelled");
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
  if (!Array.isArray(sources) || sources.length > 512) {
    throw new Error("TypeScript declaration source request limit exceeded");
  }
  const encoder = new TextEncoder();
  let bytes = 0;
  const requestFiles = sources.map((file) => {
    if (
      !file ||
      typeof file.text !== "string" ||
      typeof file.path !== "string" ||
      file.path.length > 1024 ||
      file.text.length > 1024 * 1024
    ) {
      throw new Error("TypeScript declaration source request limit exceeded");
    }
    const size = encoder.encode(file.text).byteLength;
    bytes += size;
    if (size > 1024 * 1024 || bytes > 16 * 1024 * 1024) {
      throw new Error("TypeScript declaration source request limit exceeded");
    }
    return { path: file.path, text: file.text };
  });
  const request = JSON.stringify(requestFiles);
  if (encoder.encode(request).byteLength > 32 * 1024 * 1024) {
    throw new Error("TypeScript declaration source request limit exceeded");
  }
  const utf8 = encoder.encode(request);
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
  const chunks: string[] = [];
  let bytes = 0;
  const encoder = new TextEncoder();
  const marker = "IRIS_DECLARATION_SCAN_READY:";
  let prefix = "";
  let started = false;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) return prefix + chunks.join("");
      if (typeof result.value !== "string" || result.value.length > DECLARATION_SCAN_OUTPUT_BYTES) {
        throw new Error("TypeScript declaration output limit exceeded");
      }
      bytes += encoder.encode(result.value).byteLength;
      if (bytes > DECLARATION_SCAN_OUTPUT_BYTES || chunks.length >= 8192) {
        throw new Error("TypeScript declaration output limit exceeded");
      }
      if (!started) {
        prefix += result.value;
        if (marker.startsWith(prefix) && prefix !== marker) continue;
        started = true;
        ready();
        chunks.push(prefix.startsWith(marker) ? prefix.slice(marker.length) : prefix);
        prefix = "";
      } else chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
}
