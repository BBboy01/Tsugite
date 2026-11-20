export function createDeclarationReferenceReader(
  packageName: (name: string) => string,
  check: () => void,
  entryLimit: number,
  ambientModules: Set<string>,
): (text: string, imports?: Map<string, string>) => Set<string> {
  type Token = {
    kind: "word" | "string" | "punctuation";
    value: string;
    line: number;
  };
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
      check();
      if (source[cursor] === "\\") cursor += 2;
      else if (source[cursor++] === quote) break;
    }
    return Math.min(cursor, source.length);
  }

  function templateExpressionEnd(source: string, start: number): number {
    let depth = 1;
    let cursor = start;
    while (cursor < source.length) {
      const char = source[cursor];
      if (char === "'" || char === '"')
        cursor = skipQuoted(source, cursor, char);
      else if (char.charCodeAt(0) === 96)
        cursor = templateEnd(source, cursor).end;
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

  function templateEnd(
    source: string,
    start: number,
  ): { end: number; expressions: string[] } {
    const expressions: string[] = [];
    let cursor = start + 1;
    while (cursor < source.length) {
      if (source[cursor] === "\\") cursor += 2;
      else if (source[cursor].charCodeAt(0) === 96)
        return { end: cursor + 1, expressions };
      else if (source.startsWith("${", cursor)) {
        const expressionStart = cursor + 2;
        const expressionEnd = templateExpressionEnd(source, expressionStart);
        expressions.push(source.slice(expressionStart, expressionEnd));
        cursor = expressionEnd + 1;
      } else cursor++;
    }
    return { end: source.length, expressions };
  }

  function regexCanStart(previous?: Token): boolean {
    if (!previous) return true;
    if (previous.kind === "word") return regexPrefixWords.has(previous.value);
    return (
      previous.kind === "punctuation" &&
      "([{:;,=!?&|+-*%^~<>".includes(previous.value)
    );
  }

  function skipRegex(source: string, start: number): number {
    let cursor = start + 1;
    let inClass = false;
    while (cursor < source.length && source[cursor] !== "\n") {
      check();
      if (source[cursor] === "\\") cursor += 2;
      else if (source[cursor] === "[") {
        inClass = true;
        cursor++;
      } else if (source[cursor] === "]") {
        inClass = false;
        cursor++;
      } else if (source[cursor] === "/" && !inClass) {
        cursor++;
        while (/[A-Za-z]/.test(source[cursor] || "")) cursor++;
        return cursor;
      } else cursor++;
    }
    return cursor;
  }

  return function references(
    text: string,
    imports?: Map<string, string>,
  ): Set<string> {
    const names = new Set<string>();
    const values: string[] = [];
    const tokens: Token[] = [];
    let index = 0;
    let line = 0;
    while (index < text.length) {
      check();
      const char = text[index];
      if (/\s/.test(char)) {
        if (char === "\n") line++;
        index++;
        continue;
      }
      if (text.startsWith("//", index)) {
        const end = text.indexOf("\n", index);
        const comment = text.slice(index, end < 0 ? text.length : end);
        const directive =
          /^\/\/\/\s*<reference\b[^>\n]{0,1024}?\btypes\s*=\s*(["'])([^"']+)\1/.exec(
            comment,
          );
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
        tokens.push({
          kind: "string",
          value: text.slice(start + 1, Math.max(start + 1, index - 1)),
          line,
        });
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
    function addFrom(start: number): void {
      let depth = 0;
      for (let cursor = start + 1; cursor < tokens.length; cursor++) {
        check();
        const token = tokens[cursor];
        if (token.kind === "punctuation") {
          if (token.value === "{" || token.value === "[" || token.value === "(")
            depth++;
          else if (
            token.value === "}" ||
            token.value === "]" ||
            token.value === ")"
          )
            depth--;
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
    for (let cursor = 0; cursor < tokens.length; cursor++) {
      check();
      const token = tokens[cursor];
      if (token.kind !== "word") continue;
      if (
        token.value === "declare" &&
        tokens[cursor + 1]?.value === "module" &&
        tokens[cursor + 2]?.kind === "string"
      )
        ambientModules.add(tokens[cursor + 2].value);
      if (
        token.value === "require" &&
        tokens[cursor + 1]?.value === "(" &&
        tokens[cursor + 2]?.kind === "string"
      ) {
        values.push(tokens[cursor + 2].value);
      } else if (token.value === "import") {
        if (tokens[cursor + 1]?.kind === "string")
          values.push(tokens[cursor + 1].value);
        else if (
          tokens[cursor + 1]?.value === "(" &&
          tokens[cursor + 2]?.kind === "string"
        )
          values.push(tokens[cursor + 2].value);
        else addFrom(cursor);
      } else if (token.value === "export") addFrom(cursor);
    }
    for (const value of values) {
      if (
        value.startsWith(".") ||
        value.startsWith("node:") ||
        value.startsWith("@/") ||
        value.startsWith("#")
      )
        continue;
      const name = packageName(value);
      names.add(name);
      if (imports) imports.set(value, name);
      if (names.size > entryLimit)
        throw new Error("Declaration entry limit exceeded");
    }
    return names;
  };
}
