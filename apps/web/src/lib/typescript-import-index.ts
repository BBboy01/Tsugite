import type { IntelligenceFile } from "./editor-intelligence";

const scanSliceMs = 8;

export class TypeScriptImportIndex {
  private entries = new Map<string, { text: string; references: string[] }>();
  private generation = 0;

  clear() {
    this.generation++;
    this.entries.clear();
  }

  async getKey(files: readonly IntelligenceFile[]): Promise<string> {
    const generation = ++this.generation;
    const entries = new Map<string, { text: string; references: string[] }>();
    const references = new Set<string>();
    let started = performance.now();
    for (const { path, text } of files) {
      if (!/\.[cm]?[jt]sx?$/.test(path)) continue;
      if (performance.now() - started >= scanSliceMs) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        started = performance.now();
      }
      const cached = this.entries.get(path);
      const entry =
        cached?.text === text ? cached : { text, references: findImportReferences(text) };
      entries.set(path, entry);
      for (const reference of entry.references) references.add(reference);
    }
    if (generation === this.generation) this.entries = entries;
    return JSON.stringify([...references].toSorted());
  }
}

type ImportReferenceToken = {
  kind: "word" | "string" | "punctuation";
  value: string;
  line: number;
};

const regexPrefixWords = new Set([
  "await",
  "case",
  "delete",
  "do",
  "else",
  "in",
  "instanceof",
  "of",
  "return",
  "throw",
  "typeof",
  "void",
  "yield",
]);

function skipQuoted(source: string, start: number, quote: string): number {
  let cursor = start + 1;
  while (cursor < source.length) {
    if (source[cursor] === "\\") cursor += 2;
    else if (source[cursor++] === quote) break;
  }
  return Math.min(cursor, source.length);
}

function regexCanStart(previous: ImportReferenceToken | undefined): boolean {
  if (!previous) return true;
  if (previous.kind === "word") return regexPrefixWords.has(previous.value);
  return previous.kind === "punctuation" && "([{:;,=!?&|+-*%^~<>".includes(previous.value);
}

function skipRegex(source: string, start: number): number {
  let cursor = start + 1;
  let inClass = false;
  while (cursor < source.length && source[cursor] !== "\n") {
    if (source[cursor] === "\\") cursor += 2;
    else if (source[cursor] === "[") {
      inClass = true;
      cursor++;
    } else if (source[cursor] === "]") {
      inClass = false;
      cursor++;
    } else if (source[cursor] === "/" && !inClass) {
      cursor++;
      while (/[A-Za-z]/.test(source[cursor] ?? "")) cursor++;
      return cursor;
    } else cursor++;
  }
  return cursor;
}

function findImportReferences(text: string): string[] {
  const values: string[] = [];
  const starters = new Set([
    "class",
    "const",
    "export",
    "function",
    "import",
    "interface",
    "let",
    "return",
    "type",
    "var",
  ]);
  const tokens: ImportReferenceToken[] = [];
  let offset = 0;
  let line = 0;

  function templateExpressionEnd(source: string, start: number): number {
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

  function templateEnd(source: string, start: number): { end: number; expressions: string[] } {
    const expressions: string[] = [];
    let cursor = start + 1;
    while (cursor < source.length) {
      if (source[cursor] === "\\") cursor += 2;
      else if (source[cursor].charCodeAt(0) === 96) return { end: cursor + 1, expressions };
      else if (source.startsWith("${", cursor)) {
        const expressionStart = cursor + 2;
        const expressionEnd = templateExpressionEnd(source, expressionStart);
        expressions.push(source.slice(expressionStart, expressionEnd));
        cursor = expressionEnd + 1;
      } else cursor++;
    }
    return { end: source.length, expressions };
  }

  while (offset < text.length) {
    const char = text[offset];
    if (/\s/.test(char)) {
      if (char === "\n") line++;
      offset++;
      continue;
    }
    if (text.startsWith("//", offset)) {
      const end = text.indexOf("\n", offset);
      const comment = text.slice(offset, end < 0 ? text.length : end);
      const directive = /^\/\/\/\s*<reference\b[^>\n]{0,1024}?\btypes\s*=\s*(["'])([^"']+)\1/.exec(
        comment,
      );
      if (directive) values.push(directive[2]);
      offset = end < 0 ? text.length : end;
      continue;
    }
    if (text.startsWith("/*", offset)) {
      const end = text.indexOf("*/", offset + 2);
      const stop = end < 0 ? text.length : end + 2;
      line += (text.slice(offset, stop).match(/\n/g) ?? []).length;
      offset = stop;
      continue;
    }
    if (char.charCodeAt(0) === 96) {
      const start = offset;
      const template = templateEnd(text, offset);
      for (const expression of template.expressions)
        values.push(...findImportReferences(expression));
      line += (text.slice(start, template.end).match(/\n/g) ?? []).length;
      offset = template.end;
      continue;
    }
    if (char === "'" || char === '"') {
      const start = offset;
      offset = skipQuoted(text, start, char);
      tokens.push({
        kind: "string",
        value: text.slice(start + 1, Math.max(start + 1, offset - 1)),
        line,
      });
      continue;
    }
    if (char === "/" && regexCanStart(tokens[tokens.length - 1])) {
      const start = offset;
      offset = skipRegex(text, offset);
      line += (text.slice(start, offset).match(/\n/g) ?? []).length;
      continue;
    }
    const word = /^[A-Za-z_$][\w$]*/.exec(text.slice(offset));
    if (word) {
      tokens.push({ kind: "word", value: word[0], line });
      offset += word[0].length;
    } else {
      tokens.push({ kind: "punctuation", value: char, line });
      offset++;
    }
  }

  function addFrom(start: number) {
    let depth = 0;
    for (let cursor = start + 1; cursor < tokens.length; cursor++) {
      const token = tokens[cursor];
      if (token.kind === "punctuation") {
        if (token.value === "{" || token.value === "[" || token.value === "(") depth++;
        else if (token.value === "}" || token.value === "]" || token.value === ")") depth--;
        else if (token.value === ";" && depth === 0) return;
      }
      if (
        depth === 0 &&
        token.kind === "word" &&
        starters.has(token.value) &&
        token.line > tokens[cursor - 1].line
      )
        return;
      if (
        depth === 0 &&
        token.kind === "word" &&
        token.value === "from" &&
        tokens[cursor + 1]?.kind === "string"
      ) {
        values.push(tokens[cursor + 1].value);
        return;
      }
    }
  }

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index];
    if (token.kind !== "word") continue;
    if (
      token.value === "require" &&
      tokens[index + 1]?.value === "(" &&
      tokens[index + 2]?.kind === "string"
    ) {
      values.push(tokens[index + 2].value);
    } else if (token.value === "import") {
      if (tokens[index + 1]?.kind === "string") values.push(tokens[index + 1].value);
      else if (tokens[index + 1]?.value === "(" && tokens[index + 2]?.kind === "string")
        values.push(tokens[index + 2].value);
      else addFrom(index);
    } else if (token.value === "export") addFrom(index);
  }

  return values;
}
