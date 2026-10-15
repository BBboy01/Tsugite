import type { IntelligenceFile } from "./editor-intelligence";
import type { ProjectDeclarations } from "./room-typescript-intelligence";
import { TypeScriptImportIndex } from "./typescript-import-index";
import type { RuntimeState } from "./webcontainer-runtime";

type DeclarationRuntime = {
  readTypeScriptDeclarations(sources?: readonly IntelligenceFile[]): Promise<IntelligenceFile[]>;
};
type DeclarationTarget = Pick<
  ProjectDeclarations,
  "loadDeclarations" | "clearDeclarations" | "prepareDeclarations"
>;

export class PreviewTypeScriptDeclarations {
  private ready = false;
  private importsKey: string | undefined;
  private generation = 0;
  private refreshGeneration = 0;
  private readonly imports = new TypeScriptImportIndex();
  constructor(private readonly target: DeclarationTarget) {}

  async onRuntimeState(state: RuntimeState, runtime: DeclarationRuntime, error?: string) {
    if (state === "installing") {
      this.generation++;
      this.refreshGeneration++;
      this.imports.clear();
      this.ready = false;
      this.importsKey = undefined;
      this.target.prepareDeclarations();
    } else if ((state === "paused" || state === "starting") && !this.ready) {
      this.ready = true;
      await this.refresh(runtime);
    } else if (state === "error" && !this.ready) {
      await this.target.clearDeclarations(error ?? "TypeScript declaration runtime unavailable");
    }
  }

  async syncSources(runtime: DeclarationRuntime, files: readonly IntelligenceFile[]) {
    if (!this.ready) return;
    const generation = ++this.generation;
    const key = await this.imports.getKey(files);
    if (generation !== this.generation || !this.ready) return;
    if (key === this.importsKey) return;
    this.importsKey = key;
    await this.refresh(runtime);
  }

  clear(): Promise<void> {
    this.generation++;
    this.refreshGeneration++;
    this.imports.clear();
    this.ready = false;
    this.importsKey = undefined;
    return this.target.clearDeclarations();
  }

  private refresh(runtime: DeclarationRuntime): Promise<void> {
    const generation = ++this.generation;
    const refreshGeneration = ++this.refreshGeneration;
    return this.target.loadDeclarations(async (sources) => {
      const key = await this.imports.getKey(sources);
      if (!this.ready || refreshGeneration !== this.refreshGeneration)
        throw new Error("TypeScript declaration scan cancelled");
      if (generation === this.generation) this.importsKey = key;
      const files = await runtime.readTypeScriptDeclarations(
        sources.filter(({ path }) => /\.[cm]?[jt]sx?$/.test(path)),
      );
      const metadata = files.find(({ path }) => path === "package.json");
      if (metadata) {
        const manifest = JSON.parse(metadata.text) as Record<string, unknown>;
        const paths = new Set(files.map(({ path }) => path));
        for (const field of ["dependencies", "devDependencies"]) {
          const dependencies = manifest[field];
          if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies))
            continue;
          for (const name of Object.keys(dependencies))
            if (!paths.has(`node_modules/${name}/package.json`))
              throw new Error(`TypeScript dependency not installed: ${name}`);
        }
      }
      return files;
    });
  }
}
