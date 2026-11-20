import type { DeclarationScanLimits } from "./declaration-scan-limits";
import type { createDeclarationReferenceReader } from "./declaration-scan-references";
import type { IntelligenceFile } from "./editor-intelligence";

export type DeclarationScanEnvironment = {
  fs: typeof import("node:fs/promises");
  constants: Pick<
    typeof import("node:fs").constants,
    "O_RDONLY" | "O_NOFOLLOW"
  >;
  path: typeof import("node:path");
  buffer: typeof Buffer;
  cwd: string;
  sourceArgument?: string;
  now: () => number;
};

export async function scanNodeDeclarations(
  environment: DeclarationScanEnvironment,
  limits: DeclarationScanLimits,
  createReferences: typeof createDeclarationReferenceReader,
): Promise<IntelligenceFile[]> {
  type PackageLocation = { real: string; virtual: string };
  type PackageRequest = {
    name: string;
    importer?: PackageLocation;
    ancestry: string[];
  };
  const { fs, constants, path, buffer, now } = environment;
  const deadline = now() + limits.deadlineMs;
  const files: IntelligenceFile[] = [];
  const filePaths = new Set<string>();
  const packageCopies = new Map<string, Set<string>>();
  const queue: PackageRequest[] = [];
  const sourceImports = new Map<string, string>();
  const typedPackages = new Set<string>();
  const ambientModules = new Set<string>();
  let entries = 0;
  let bytes = 0;
  const root = await fs.realpath(environment.cwd);
  const modules = path.join(root, "node_modules");

  function check(): void {
    if (now() >= deadline)
      throw new Error("Declaration read deadline exceeded");
  }

  function inside(base: string, target: string): boolean {
    return target === base || target.startsWith(base + path.sep);
  }

  function safeParts(value: unknown): value is string {
    return (
      typeof value === "string" &&
      value.length > 0 &&
      value.length <= limits.pathLength &&
      !/[\\:?#]/.test(value) &&
      ![...value].some(
        (character) =>
          character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) &&
      value
        .split("/")
        .every(
          (part) =>
            part && part !== "." && part !== ".." && !part.startsWith(".env"),
        )
    );
  }

  function packageName(value: string, exact = false): string {
    if (!safeParts(value)) throw new Error("Invalid declaration package path");
    const parts = value.split("/");
    const count = parts[0].startsWith("@") ? 2 : 1;
    if (
      parts.length < count ||
      (count === 2 && parts[0] === "@") ||
      (exact && parts.length !== count)
    ) {
      throw new Error("Invalid declaration package path");
    }
    return parts.slice(0, count).join("/");
  }

  async function inspect(candidate: string, base: string) {
    check();
    if (!inside(base, candidate))
      throw new Error("Declaration path outside workspace node_modules");
    const initial = await fs.lstat(candidate);
    if (initial.isSymbolicLink()) {
      const target = path.resolve(
        path.dirname(candidate),
        await fs.readlink(candidate),
      );
      if (!inside(base, target))
        throw new Error("Declaration path outside workspace node_modules");
      if (target.split(path.sep).some((part) => part.startsWith(".env")))
        throw new Error("Invalid declaration path");
    }
    let real: string;
    try {
      real = await fs.realpath(candidate);
    } catch (error) {
      if (initial.isSymbolicLink())
        throw new Error("Invalid declaration symlink target", { cause: error });
      throw error;
    }
    if (!inside(base, real))
      throw new Error("Declaration path outside workspace node_modules");
    if (real.split(path.sep).some((part) => part.startsWith(".env")))
      throw new Error("Invalid declaration path");
    const stat = await fs.lstat(real);
    check();
    return { real, stat };
  }

  function read(
    candidate: string,
    virtual: string,
    base: string,
    metadata: true,
  ): Promise<Record<string, unknown> | undefined>;
  function read(
    candidate: string,
    virtual: string,
    base: string,
    metadata: false,
  ): Promise<string | undefined>;
  async function read(
    candidate: string,
    virtual: string,
    base: string,
    metadata: boolean,
  ): Promise<Record<string, unknown> | string | undefined> {
    const { real, stat } = await inspect(candidate, base);
    if (!stat.isFile()) throw new Error("Invalid declaration file kind");
    if (
      metadata
        ? path.basename(real) !== "package.json"
        : !/\.d\.(?:ts|mts|cts)$/.test(real)
    ) {
      throw new Error("Invalid declaration file kind");
    }
    const cap = metadata ? limits.metadataBytes : limits.fileBytes;
    if (stat.size > cap)
      throw new Error("TypeScript declaration byte limit exceeded");
    if (filePaths.has(virtual)) return;
    if (files.length >= limits.files)
      throw new Error("TypeScript declaration file limit exceeded");
    if (bytes + stat.size > limits.totalBytes)
      throw new Error("TypeScript declaration workspace limit exceeded");
    const handle = await fs.open(
      real,
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    let text: string;
    try {
      const current = await handle.stat();
      if (!current.isFile() || current.size > cap)
        throw new Error("TypeScript declaration byte limit exceeded");
      const contents = buffer.alloc(Math.min(cap, current.size) + 1);
      let offset = 0;
      while (offset < contents.length) {
        check();
        const result = await handle.read(
          contents,
          offset,
          contents.length - offset,
          offset,
        );
        if (!result.bytesRead) break;
        offset += result.bytesRead;
      }
      if (offset > cap || offset > current.size)
        throw new Error("TypeScript declaration byte limit exceeded");
      text = contents.subarray(0, offset).toString("utf8");
    } finally {
      await handle.close();
    }
    check();
    const size = buffer.byteLength(text);
    if (size > cap)
      throw new Error("TypeScript declaration byte limit exceeded");
    if (bytes + size > limits.totalBytes)
      throw new Error("TypeScript declaration workspace limit exceeded");
    let value: Record<string, unknown> | undefined;
    if (metadata) {
      const parsed: unknown = JSON.parse(text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Invalid TypeScript package metadata");
      value = parsed as Record<string, unknown>;
      for (const field of ["types", "typings"]) {
        if (
          typeof value[field] === "string" &&
          !safeParts(value[field].replace(/^\.\//, ""))
        ) {
          throw new Error("Invalid declaration type entry");
        }
      }
    }
    files.push({ path: virtual, text });
    filePaths.add(virtual);
    bytes += size;
    return metadata ? value : text;
  }

  const references = createReferences(
    packageName,
    check,
    limits.entries,
    ambientModules,
  );

  function companionName(name: string): string {
    check();
    return (
      "@types/" +
      (name.startsWith("@") ? name.slice(1).replace("/", "__") : name)
    );
  }

  function request(
    name: string,
    importer?: PackageLocation,
    ancestry: string[] = [],
  ): void {
    queue.push({ name: packageName(name, true), importer, ancestry });
    if (!name.startsWith("@types/"))
      queue.push({ name: companionName(name), importer, ancestry });
    if (queue.length > limits.entries)
      throw new Error("Declaration entry limit exceeded");
  }

  async function resolvePackage(
    name: string,
    importer?: PackageLocation,
  ): Promise<PackageLocation | undefined> {
    let directory = importer ? importer.real : root;
    while (inside(root, directory)) {
      const candidate = path.join(directory, "node_modules", name);
      if (inside(modules, candidate)) {
        try {
          const found = await inspect(candidate, modules);
          if (!found.stat.isDirectory())
            throw new Error("Invalid declaration package kind");
          const virtual =
            directory === root
              ? "node_modules/" + name
              : importer!.virtual + "/node_modules/" + name;
          return { real: found.real, virtual };
        } catch (error) {
          if (
            !error ||
            typeof error !== "object" ||
            !("code" in error) ||
            error.code !== "ENOENT"
          )
            throw error;
        }
      }
      if (directory === root) break;
      directory = path.dirname(directory);
    }
  }

  async function walk(
    directory: string,
    virtual: string,
    names: Set<string>,
    seen: Set<string>,
  ): Promise<void> {
    check();
    const found = await inspect(directory, modules);
    if (seen.has(found.real))
      throw new Error("Declaration directory symlink cycle");
    const nextSeen = new Set(seen);
    nextSeen.add(found.real);
    const iterator = await fs.opendir(found.real);
    for await (const entry of iterator) {
      check();
      if (++entries > limits.entries)
        throw new Error("Declaration entry limit exceeded");
      if (
        entry.name === "node_modules" ||
        entry.name.startsWith(".env") ||
        entry.name === ".git"
      )
        continue;
      const declaration = /\.d\.(?:ts|mts|cts)$/.test(entry.name);
      const metadata = entry.name === "package.json";
      if (!entry.isDirectory() && !declaration && !metadata) continue;
      const candidate = path.join(found.real, entry.name);
      const target = await inspect(candidate, modules);
      const filePath = virtual + "/" + entry.name;
      if (!safeParts(filePath))
        throw new Error("Invalid TypeScript declaration path");
      if (target.stat.isDirectory())
        await walk(target.real, filePath, names, nextSeen);
      else if (metadata) await read(target.real, filePath, modules, true);
      else if (declaration) {
        const text = await read(target.real, filePath, modules, false);
        if (text !== undefined)
          for (const name of references(text)) names.add(name);
      }
    }
  }

  const toolingPackages = new Set([
    "@tailwindcss/vite",
    "@vitejs/plugin-react",
    "tailwindcss",
    "typescript",
    "vite",
  ]);
  const metadata = await read(
    path.join(root, "package.json"),
    "package.json",
    root,
    true,
  );
  for (const field of [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
  ]) {
    const dependencies = metadata?.[field];
    if (
      dependencies &&
      typeof dependencies === "object" &&
      !Array.isArray(dependencies)
    ) {
      for (const name of Object.keys(dependencies)) {
        if (field === "devDependencies" && toolingPackages.has(name)) continue;
        request(name);
      }
    }
  }
  const sourceArgument = environment.sourceArgument;
  if (sourceArgument) {
    if (buffer.byteLength(sourceArgument) > limits.sourceRequestBytes)
      throw new Error("Declaration source request limit exceeded");
    const sources: unknown = JSON.parse(
      buffer.from(sourceArgument, "base64").toString("utf8"),
    );
    if (!Array.isArray(sources) || sources.length > limits.sourceFiles)
      throw new Error("Invalid declaration source request");
    let sourceBytes = 0;
    for (const source of sources) {
      if (
        !source ||
        typeof source.text !== "string" ||
        typeof source.path !== "string" ||
        source.path.length > limits.pathLength ||
        source.text.length > limits.sourceFileBytes
      )
        throw new Error("Invalid declaration source request");
      const size = buffer.byteLength(source.text);
      sourceBytes += size;
      if (
        size > limits.sourceFileBytes ||
        sourceBytes > limits.sourceTotalBytes
      )
        throw new Error("Declaration source request limit exceeded");
      const imports = references(
        source.text,
        source.path === "vite.config.ts" ? undefined : sourceImports,
      );
      for (const name of imports) {
        if (source.path === "vite.config.ts" && toolingPackages.has(name))
          continue;
        request(name);
      }
    }
  }
  for (let index = 0; index < queue.length; index++) {
    check();
    const task = queue[index];
    const resolved = await resolvePackage(task.name, task.importer);
    if (!resolved || task.ancestry.includes(resolved.real)) continue;
    const existing = packageCopies.get(resolved.real);
    if (existing?.has(resolved.virtual)) continue;
    if (!existing)
      packageCopies.set(resolved.real, new Set([resolved.virtual]));
    else existing.add(resolved.virtual);
    const names = new Set<string>();
    const before = files.length;
    await walk(resolved.real, resolved.virtual, names, new Set());
    if (
      !task.importer &&
      files.slice(before).some((file) => /\.d\.(?:ts|mts|cts)$/.test(file.path))
    )
      typedPackages.add(task.name);
    const ancestry = [...task.ancestry, resolved.real];
    for (const name of names) request(name, resolved, ancestry);
  }
  for (const [specifier, name] of sourceImports) {
    const ambient = [...ambientModules].some((pattern) => {
      const star = pattern.indexOf("*");
      return (
        pattern === specifier ||
        (star >= 0 &&
          specifier.startsWith(pattern.slice(0, star)) &&
          specifier.endsWith(pattern.slice(star + 1)))
      );
    });
    if (
      !ambient &&
      !typedPackages.has(name) &&
      !typedPackages.has(companionName(name))
    )
      throw new Error("TypeScript declarations missing: " + name);
  }
  check();
  if (
    buffer.byteLength(JSON.stringify({ status: "ok", files })) >
    limits.outputBytes
  )
    throw new Error("TypeScript declaration output limit exceeded");
  return files;
}
