type TextFile = { path: string; text: string };

function padUtf8To(text: string, targetBytes: number) {
  const byteLength = new TextEncoder().encode(text).byteLength;
  if (byteLength > targetBytes) throw new Error("Fixture prefix exceeds its byte budget");
  const paddingBytes = targetBytes - byteLength;
  return paddingBytes === 0 ? text : `${text}\n//${"x".repeat(paddingBytes - 3)}`;
}

export function createMaximumBudgetFixtures(graph: readonly TextFile[]) {
  const productionSources = graph.filter(
    (file) => file.path.endsWith(".ts") && !file.path.endsWith(".d.ts"),
  );
  const productionDeclarations = graph.filter(
    (file) => file.path.endsWith(".d.ts") || file.path.endsWith("package.json"),
  );
  const sources = Array.from({ length: 512 }, (_, index) => {
    const production = productionSources[index];
    const source =
      production?.text ??
      (index === 3
        ? 'import type { EditorTabViewModel } from "./editor-tab-model";\nimport type { FixtureTypes } from "../node_modules/@iris/shared/types/index";\nexport type Stress3 = [EditorTabViewModel, FixtureTypes];'
        : `import type { EditorTabViewModel } from "./editor-tab-model";\nexport type Stress${index} = EditorTabViewModel;`);
    return {
      path: production?.path ?? `src/stress-${index}.ts`,
      text: padUtf8To(source, 32 * 1024),
    };
  });
  const sourceRemainder =
    16 * 1024 * 1024 -
    sources.reduce((total, file) => total + new TextEncoder().encode(file.text).byteLength, 0);
  if (sourceRemainder > 0) {
    sources[3]!.text = padUtf8To(sources[3]!.text, 32 * 1024 + sourceRemainder);
  }

  const fixtureCount = 1024 - productionDeclarations.length - 1;
  const declarationImports = Array.from(
    { length: fixtureCount },
    (_, index) => `import type { Fixture${index} } from "./fixture-${index}";`,
  ).join("\n");
  const declarationExports = `export type FixtureTypes = [${Array.from(
    { length: fixtureCount },
    (_, index) => `Fixture${index}`,
  ).join(", ")}];`;
  const declarationIndex = {
    path: "node_modules/@iris/shared/types/index.d.ts",
    text: `${declarationImports}\n${declarationExports}`,
  };
  const declarations = [
    ...productionDeclarations,
    declarationIndex,
    ...Array.from({ length: fixtureCount }, (_, index) => ({
      path: `node_modules/@iris/shared/types/fixture-${index}.d.ts`,
      text: `export type Fixture${index} = { value: string };`,
    })),
  ];
  const declarationPrefixBytes = declarations.reduce(
    (total, file) => total + new TextEncoder().encode(file.text).byteLength,
    0,
  );
  const declarationPadding = 8 * 1024 * 1024 - declarationPrefixBytes;
  const declarationFiles = declarations.map((file) => ({ ...file }));
  const paddedDeclarationCount = fixtureCount + 1;
  const declarationTarget = Math.floor(declarationPadding / paddedDeclarationCount);
  let declarationRemainder = declarationPadding % paddedDeclarationCount;
  for (const file of declarationFiles) {
    if (!file.path.includes("@iris/shared/types/") || !file.path.endsWith(".d.ts")) continue;
    const extra = declarationRemainder > 0 ? 1 : 0;
    file.text = padUtf8To(
      file.text,
      new TextEncoder().encode(file.text).byteLength + declarationTarget + extra,
    );
    declarationRemainder -= extra;
  }

  const measuredBytes = {
    source: sources.reduce(
      (total, file) => total + new TextEncoder().encode(file.text).byteLength,
      0,
    ),
    declarations: declarationFiles.reduce(
      (total, file) => total + new TextEncoder().encode(file.text).byteLength,
      0,
    ),
  };
  return { sources, declarationFiles, measuredBytes };
}
