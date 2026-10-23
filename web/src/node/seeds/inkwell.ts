import type { RepoSeed } from "./types";

const readme = `# inkwell

A prose linter for Markdown. It reads your docs the way a careful editor
would and points out passive voice, padding words and the the typos your
spellchecker can't see.

    npm install --save-dev @quill/inkwell
    npx inkwell README.md docs/*.md

## Rules

| Rule | Default | What it catches |
|---|---|---|
| \`passive-voice\` | warning | "was written", "is being reviewed" |
| \`weasel-words\` | warning | "very", "quite", "basically" |
| \`repeated-words\` | error | "the the" |

Every rule and its options are described in [docs/rules.md](docs/rules.md).

## Configuration

Put an \`.inkwellrc.json\` next to your docs. inkwell looks in the file's
directory and then in each parent until it finds one:

    {
      "rules": {
        "passive-voice": "off",
        "weasel-words": ["error", { "words": ["very", "really"] }]
      }
    }

A rule is \`"off"\`, \`"warning"\` or \`"error"\`, optionally followed by its
options. Errors make \`inkwell\` exit with status 1.

## Development

    npm install
    npm run build
    npm test
`;

const license = `MIT License

Copyright (c) 2025 Quill contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const packageJson = `{
  "name": "@quill/inkwell",
  "version": "0.1.0",
  "description": "A prose linter for Markdown",
  "license": "MIT",
  "type": "module",
  "bin": { "inkwell": "dist/cli.js" },
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "lint:docs": "node dist/cli.js README.md docs/*.md"
  },
  "engines": { "node": ">=18.3" },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "typescript": "^5.4.0",
    "vitest": "^1.4.0"
  }
}
`;

const tsconfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
`;

const inkwellrc = `{
  "rules": {
    "weasel-words": ["warning", { "words": ["very", "really", "basically", "obviously"] }]
  }
}
`;

const changelogRoot = `# Changelog

## 0.1.0

- First release: the passive-voice, weasel-words and repeated-words rules,
  \`.inkwellrc.json\` configuration and the \`inkwell\` command.
`;

const changelog020 = `# Changelog

## 0.2.0

- New rule: \`heading-case\` checks that headings use title or sentence case.
- \`weasel-words\` takes \`extend\` and \`allow\` options, so you can tweak the
  built-in list without copying it.
- Code blocks and inline code are no longer linted.
- \`passive-voice\` no longer flags "was red", "is embed" and friends.
- \`--format json\` for editors and CI annotations.
- Snapshot tests over real-world fixtures.

## 0.1.0

- First release: the passive-voice, weasel-words and repeated-words rules,
  \`.inkwellrc.json\` configuration and the \`inkwell\` command.
`;

const changelog030 = `# Changelog

## 0.3.0

- New rule: \`consistent-spelling\` flags "colour" and "color" (and a few
  other pairs) in the same document.
- A misspelled rule name in \`.inkwellrc.json\` is now an error, with a
  suggestion, instead of being silently ignored.
- \`repeated-words\` allows "had had" and "that that" by default; set
  \`allow\` to change the list.
- Respect \`NO_COLOR\` and \`FORCE_COLOR\`.
- \`inkwell-server\`: a small language server, so editors can show
  diagnostics as you type.
- \`heading-case\` leaves acronyms such as API and HTML alone.

## 0.2.0

- New rule: \`heading-case\` checks that headings use title or sentence case.
- \`weasel-words\` takes \`extend\` and \`allow\` options, so you can tweak the
  built-in list without copying it.
- Code blocks and inline code are no longer linted.
- \`passive-voice\` no longer flags "was red", "is embed" and friends.
- \`--format json\` for editors and CI annotations.
- Snapshot tests over real-world fixtures.

## 0.1.0

- First release: the passive-voice, weasel-words and repeated-words rules,
  \`.inkwellrc.json\` configuration and the \`inkwell\` command.
`;

const changelog040 = `# Changelog

## 0.4.0

- \`consistent-spelling\` understands -ise/-ize across a whole word family:
  "organise", "organisation" and "organising" all count as -ise.
- \`--stdin\` reads Markdown from standard input.
- \`--max-warnings <n>\` fails the run when there are too many warnings.
- \`heading-case\` no longer reports headings that contain inline code.
- \`inkwell-server\` offers quick fixes for diagnostics with a suggestion.
- Faster tokenizing on long documents.

## 0.3.0

- New rule: \`consistent-spelling\` flags "colour" and "color" (and a few
  other pairs) in the same document.
- A misspelled rule name in \`.inkwellrc.json\` is now an error, with a
  suggestion, instead of being silently ignored.
- \`repeated-words\` allows "had had" and "that that" by default; set
  \`allow\` to change the list.
- Respect \`NO_COLOR\` and \`FORCE_COLOR\`.
- \`inkwell-server\`: a small language server, so editors can show
  diagnostics as you type.
- \`heading-case\` leaves acronyms such as API and HTML alone.

## 0.2.0

- New rule: \`heading-case\` checks that headings use title or sentence case.
- \`weasel-words\` takes \`extend\` and \`allow\` options, so you can tweak the
  built-in list without copying it.
- Code blocks and inline code are no longer linted.
- \`passive-voice\` no longer flags "was red", "is embed" and friends.
- \`--format json\` for editors and CI annotations.
- Snapshot tests over real-world fixtures.

## 0.1.0

- First release: the passive-voice, weasel-words and repeated-words rules,
  \`.inkwellrc.json\` configuration and the \`inkwell\` command.
`;

const typesTs = `import type { Token } from "./tokenize.js";

export type Severity = "off" | "warning" | "error";

export interface Diagnostic {
  rule: string;
  message: string;
  line: number;
  column: number;
  length: number;
  severity: Exclude<Severity, "off">;
  suggestions?: string[];
}

export type Finding = Omit<Diagnostic, "rule" | "severity">;

export interface RuleContext {
  source: string;
  tokens: Token[];
  options: Record<string, unknown>;
}

export interface Rule {
  name: string;
  description: string;
  defaultSeverity: Exclude<Severity, "off">;
  check(context: RuleContext): Finding[];
}
`;

const tokenizeTs = `export interface Token {
  text: string;
  lower: string;
  offset: number;
  line: number;
  column: number;
}

const WORD = /[\\p{L}\\p{N}][\\p{L}\\p{N}'’-]*/gu;

export function tokenize(source: string): Token[] {
  const lineStarts = [0];
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\n") lineStarts.push(i + 1);
  }
  const tokens: Token[] = [];
  let line = 0;
  for (const match of source.matchAll(WORD)) {
    const offset = match.index ?? 0;
    while (line + 1 < lineStarts.length && lineStarts[line + 1] <= offset) line++;
    tokens.push({
      text: match[0],
      lower: match[0].toLowerCase(),
      offset,
      line: line + 1,
      column: offset - lineStarts[line] + 1,
    });
  }
  return tokens;
}
`;

const lintTs = `import type { Config } from "./config.js";
import { rules } from "./rules/index.js";
import { tokenize } from "./tokenize.js";
import type { Diagnostic } from "./types.js";

export function lint(source: string, config: Config): Diagnostic[] {
  const tokens = tokenize(source);
  const diagnostics: Diagnostic[] = [];
  for (const rule of rules) {
    const setting = config.rules[rule.name];
    const severity = setting?.severity ?? rule.defaultSeverity;
    if (severity === "off") continue;
    const options = setting?.options ?? {};
    for (const found of rule.check({ source, tokens, options })) {
      diagnostics.push({ ...found, rule: rule.name, severity });
    }
  }
  return diagnostics.sort((a, b) => a.line - b.line || a.column - b.column);
}
`;

const configTs = `import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import type { Severity } from "./types.js";

export interface RuleConfig {
  severity: Severity;
  options: Record<string, unknown>;
}

export interface Config {
  rules: Record<string, RuleConfig>;
  ignore: string[];
}

type RawRule = Severity | [Severity, Record<string, unknown>?];

const FILENAME = ".inkwellrc.json";

export function findConfig(start: string): string | undefined {
  let dir = resolve(start);
  for (;;) {
    const candidate = join(dir, FILENAME);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function parseConfig(text: string): Config {
  const raw = JSON.parse(text) as { rules?: Record<string, RawRule>; ignore?: string[] };
  const rules: Record<string, RuleConfig> = {};
  for (const [name, value] of Object.entries(raw.rules ?? {})) {
    rules[name] = Array.isArray(value)
      ? { severity: value[0], options: value[1] ?? {} }
      : { severity: value, options: {} };
  }
  return { rules, ignore: raw.ignore ?? [] };
}

export function loadConfig(start: string): Config {
  const path = findConfig(start);
  if (!path) return { rules: {}, ignore: [] };
  return parseConfig(readFileSync(path, "utf8"));
}
`;

const formatTs = `import type { Diagnostic } from "./types.js";

export function formatPretty(file: string, diagnostics: Diagnostic[]): string {
  return diagnostics
    .map((d) => \`\${file}:\${d.line}:\${d.column}  \${d.severity.padEnd(7)}  \${d.message}  \${d.rule}\\n\`)
    .join("");
}
`;

const formatJsonTs = `import type { Diagnostic } from "./types.js";

export interface FileResult {
  file: string;
  diagnostics: Diagnostic[];
}

const color = process.stdout.isTTY;

function paint(code: number, text: string): string {
  return color ? \`\\x1b[\${code}m\${text}\\x1b[0m\` : text;
}

export function formatPretty(file: string, diagnostics: Diagnostic[]): string {
  return diagnostics
    .map((d) => {
      const severity = paint(d.severity === "error" ? 31 : 33, d.severity.padEnd(7));
      return \`\${file}:\${d.line}:\${d.column}  \${severity}  \${d.message}  \${paint(2, d.rule)}\\n\`;
    })
    .join("");
}

export function formatJson(results: FileResult[]): string {
  return JSON.stringify(results, null, 2) + "\\n";
}
`;

const cliTs = `#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";

import { loadConfig } from "./config.js";
import { formatPretty } from "./format.js";
import { lint } from "./lint.js";

const VERSION = "0.1.0";

const USAGE = \`usage: inkwell [options] <file>...

options:
  --version                print the version and exit
  --help                   print this help and exit
\`;

function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      help: { type: "boolean" },
      version: { type: "boolean" },
    },
  });
  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (values.version) {
    process.stdout.write(\`inkwell \${VERSION}\\n\`);
    return 0;
  }
  if (positionals.length === 0) {
    process.stderr.write(USAGE);
    return 2;
  }
  let errors = 0;
  for (const file of positionals) {
    const source = readFileSync(file, "utf8");
    const diagnostics = lint(source, loadConfig(dirname(file)));
    process.stdout.write(formatPretty(file, diagnostics));
    errors += diagnostics.filter((d) => d.severity === "error").length;
  }
  return errors > 0 ? 1 : 0;
}

process.exit(main(process.argv.slice(2)));
`;

const indexTs = `export { findConfig, loadConfig, parseConfig } from "./config.js";
export type { Config, RuleConfig } from "./config.js";
export { lint } from "./lint.js";
export { rules } from "./rules/index.js";
export { tokenize } from "./tokenize.js";
export type { Token } from "./tokenize.js";
export type { Diagnostic, Rule, RuleContext, Severity } from "./types.js";
`;

const rulesIndexRoot = `import type { Rule } from "../types.js";
import { passiveVoice } from "./passive-voice.js";
import { repeatedWords } from "./repeated-words.js";
import { weaselWords } from "./weasel-words.js";

export const rules: Rule[] = [passiveVoice, repeatedWords, weaselWords];
`;

const rulesIndexHeading = `import type { Rule } from "../types.js";
import { headingCase } from "./heading-case.js";
import { passiveVoice } from "./passive-voice.js";
import { repeatedWords } from "./repeated-words.js";
import { weaselWords } from "./weasel-words.js";

export const rules: Rule[] = [headingCase, passiveVoice, repeatedWords, weaselWords];
`;

const rulesIndexSpelling = `import type { Rule } from "../types.js";
import { consistentSpelling } from "./consistent-spelling.js";
import { headingCase } from "./heading-case.js";
import { passiveVoice } from "./passive-voice.js";
import { repeatedWords } from "./repeated-words.js";
import { weaselWords } from "./weasel-words.js";

export const rules: Rule[] = [
  consistentSpelling,
  headingCase,
  passiveVoice,
  repeatedWords,
  weaselWords,
];
`;

const passiveVoiceTs = `import type { Finding, Rule } from "../types.js";

const BE = new Set(["am", "is", "are", "was", "were", "be", "been", "being"]);

const IRREGULAR = new Set([
  "begun", "built", "caught", "chosen", "done", "driven", "forgotten", "given",
  "held", "hidden", "kept", "known", "left", "made", "meant", "paid", "read",
  "run", "said", "seen", "sent", "set", "shown", "taken", "taught", "thrown",
  "told", "written",
]);

function looksLikeParticiple(word: string): boolean {
  return word.endsWith("ed") || IRREGULAR.has(word);
}

export const passiveVoice: Rule = {
  name: "passive-voice",
  description: "Flags a form of 'to be' followed by a past participle.",
  defaultSeverity: "warning",
  check({ tokens }) {
    const found: Finding[] = [];
    for (let i = 0; i + 1 < tokens.length; i++) {
      const be = tokens[i];
      if (!BE.has(be.lower)) continue;
      let next = tokens[i + 1];
      if (next.lower.endsWith("ly") && i + 2 < tokens.length) next = tokens[i + 2];
      if (!looksLikeParticiple(next.lower)) continue;
      found.push({
        message: \`"\${be.text} \${next.text}" may be passive voice.\`,
        line: be.line,
        column: be.column,
        length: next.offset + next.text.length - be.offset,
      });
    }
    return found;
  },
};
`;

const weaselWordsTs = `import type { Rule } from "../types.js";

export const DEFAULT_WEASELS = [
  "very", "really", "quite", "fairly", "extremely", "basically", "simply",
  "just", "clearly", "obviously", "somewhat", "various", "several",
];

export const weaselWords: Rule = {
  name: "weasel-words",
  description: "Flags words that pad a claim without adding meaning.",
  defaultSeverity: "warning",
  check({ tokens, options }) {
    const words = new Set(
      (options.words as string[] | undefined) ?? DEFAULT_WEASELS,
    );
    return tokens
      .filter((t) => words.has(t.lower))
      .map((t) => ({
        message: \`"\${t.text}" adds little; consider removing it.\`,
        line: t.line,
        column: t.column,
        length: t.text.length,
      }));
  },
};
`;

const repeatedWordsTs = `import type { Finding, Rule } from "../types.js";

export const repeatedWords: Rule = {
  name: "repeated-words",
  description: "Flags the same word twice in a row, as in 'the the'.",
  defaultSeverity: "error",
  check({ tokens, source }) {
    const found: Finding[] = [];
    for (let i = 1; i < tokens.length; i++) {
      const prev = tokens[i - 1];
      const cur = tokens[i];
      if (prev.lower !== cur.lower) continue;
      const between = source.slice(prev.offset + prev.text.length, cur.offset);
      if (!/^\\s+$/.test(between)) continue;
      found.push({
        message: \`"\${cur.text}" is repeated.\`,
        line: cur.line,
        column: cur.column,
        length: cur.text.length,
        suggestions: [""],
      });
    }
    return found;
  },
};
`;

const headingCaseTs = `import type { Finding, Rule } from "../types.js";

const SMALL = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on",
  "or", "the", "to", "via", "with",
]);

type Style = "title" | "sentence";

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function titleCase(words: string[]): string[] {
  return words.map((w, i) => {
    const lower = w.toLowerCase();
    if (i > 0 && i < words.length - 1 && SMALL.has(lower)) return lower;
    return capitalise(lower);
  });
}

function sentenceCase(words: string[]): string[] {
  return words.map((w, i) => {
    const lower = w.toLowerCase();
    return i === 0 ? capitalise(lower) : lower;
  });
}

export const headingCase: Rule = {
  name: "heading-case",
  description: "Checks that Markdown headings use one capitalisation style.",
  defaultSeverity: "warning",
  check({ source, options }) {
    const style = (options.style as Style | undefined) ?? "title";
    const found: Finding[] = [];
    source.split("\\n").forEach((line, index) => {
      const match = /^(#{1,6})\\s+(.*)$/.exec(line);
      if (!match) return;
      const text = match[2].trim();
      const words = text.split(/\\s+/);
      const expected = (style === "title" ? titleCase(words) : sentenceCase(words)).join(" ");
      if (expected === text) return;
      found.push({
        message: \`Heading should be in \${style} case: "\${expected}".\`,
        line: index + 1,
        column: match[1].length + 2,
        length: text.length,
        suggestions: [expected],
      });
    });
    return found;
  },
};
`;

const markdownTs = `// Replace fenced code blocks and inline code with spaces, keeping every
// newline, so token offsets, lines and columns still match the source.
export function maskCode(source: string): string {
  let inFence = false;
  return source
    .split("\\n")
    .map((line) => {
      if (!inFence && line.startsWith("\`\`\`")) {
        inFence = true;
        return blank(line);
      }
      if (inFence) {
        if (line === "\`\`\`") inFence = false;
        return blank(line);
      }
      return line.replace(/\`[^\`]*\`/g, blank);
    })
    .join("\\n");
}

function blank(text: string): string {
  return " ".repeat(text.length);
}
`;

const markdownTestTs = `import { describe, expect, it } from "vitest";

import { maskCode } from "../src/markdown.js";

describe("maskCode", () => {
  it("blanks fenced code but keeps line breaks", () => {
    const masked = maskCode("Before\\n\`\`\`sh\\nnpm run the the build\\n\`\`\`\\nAfter");
    expect(masked.split("\\n")).toHaveLength(5);
    expect(masked).not.toContain("the the");
    expect(masked.endsWith("After")).toBe(true);
  });

  it("blanks inline code", () => {
    expect(maskCode("Run \`rm -rf\` carefully")).toBe("Run          carefully");
  });
});
`;

const consistentSpellingTs = `import type { Finding, Rule } from "../types.js";

const PAIRS: [string, string][] = [
  ["colour", "color"],
  ["grey", "gray"],
  ["centre", "center"],
  ["licence", "license"],
  ["catalogue", "catalog"],
  ["organise", "organize"],
  ["recognise", "recognize"],
];

export const consistentSpelling: Rule = {
  name: "consistent-spelling",
  description: "Flags a word spelled two different ways in one document.",
  defaultSeverity: "warning",
  check({ tokens }) {
    const found: Finding[] = [];
    for (const [a, b] of PAIRS) {
      const first = tokens.find((t) => t.lower.startsWith(a) || t.lower.startsWith(b));
      if (!first) continue;
      const chosen = first.lower.startsWith(a) ? a : b;
      const other = chosen === a ? b : a;
      for (const t of tokens) {
        if (!t.lower.startsWith(other)) continue;
        found.push({
          message: \`"\${t.text}" is spelled "\${chosen}" earlier in this document.\`,
          line: t.line,
          column: t.column,
          length: t.text.length,
        });
      }
    }
    return found;
  },
};
`;

const consistentSpellingIseTs = `import type { Token } from "../tokenize.js";
import type { Finding, Rule } from "../types.js";

const PAIRS: [string, string][] = [
  ["colour", "color"],
  ["grey", "gray"],
  ["centre", "center"],
  ["licence", "license"],
  ["catalogue", "catalog"],
];

// Words that end in -ise or -ize but have only one accepted spelling.
const ONE_SPELLING = new Set([
  "advise", "arise", "comprise", "compromise", "concise", "devise", "exercise",
  "expertise", "franchise", "otherwise", "precise", "premise", "prize", "promise",
  "revise", "seize", "size", "surprise", "televise", "wise",
]);

type Suffix = "ise" | "ize";

export function suffixOf(word: string): Suffix | undefined {
  const match = /^(.{3,})(is|iz)(e|es|ed|er|ers|ing|ation|ations)$/.exec(word);
  if (!match || ONE_SPELLING.has(match[1] + match[2] + "e")) return undefined;
  return match[2] === "is" ? "ise" : "ize";
}

function checkPairs(tokens: Token[], found: Finding[]): void {
  for (const [a, b] of PAIRS) {
    const first = tokens.find((t) => t.lower.startsWith(a) || t.lower.startsWith(b));
    if (!first) continue;
    const chosen = first.lower.startsWith(a) ? a : b;
    const other = chosen === a ? b : a;
    for (const t of tokens) {
      if (!t.lower.startsWith(other)) continue;
      found.push({
        message: \`"\${t.text}" is spelled "\${chosen}" earlier in this document.\`,
        line: t.line,
        column: t.column,
        length: t.text.length,
      });
    }
  }
}

function checkSuffixes(tokens: Token[], found: Finding[]): void {
  let chosen: { suffix: Suffix; example: string } | undefined;
  for (const t of tokens) {
    const suffix = suffixOf(t.lower);
    if (!suffix) continue;
    if (!chosen) {
      chosen = { suffix, example: t.text };
    } else if (suffix !== chosen.suffix) {
      found.push({
        message: \`"\${t.text}" uses -\${suffix}, but "\${chosen.example}" earlier uses -\${chosen.suffix}.\`,
        line: t.line,
        column: t.column,
        length: t.text.length,
      });
    }
  }
}

export const consistentSpelling: Rule = {
  name: "consistent-spelling",
  description: "Flags a word spelled two different ways in one document.",
  defaultSeverity: "warning",
  check({ tokens }) {
    const found: Finding[] = [];
    checkPairs(tokens, found);
    checkSuffixes(tokens, found);
    return found;
  },
};
`;

const serverTs = `#!/usr/bin/env node
// A small Language Server Protocol endpoint over stdio. It implements just
// enough of the protocol for editors to show inkwell diagnostics as you
// type: initialize, full document sync, and shutdown.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { type Config, loadConfig } from "./config.js";
import { lint } from "./lint.js";
import type { Diagnostic } from "./types.js";

interface Message {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: any;
}

const documents = new Map<string, string>();
const configs = new Map<string, Config>();

function send(message: object): void {
  const body = JSON.stringify({ jsonrpc: "2.0", ...message });
  process.stdout.write(\`Content-Length: \${Buffer.byteLength(body)}\\r\\n\\r\\n\${body}\`);
}

function configFor(uri: string): Config {
  const dir = dirname(fileURLToPath(uri));
  let config = configs.get(dir);
  if (!config) {
    config = loadConfig(dir);
    configs.set(dir, config);
  }
  return config;
}

// LSP positions count UTF-16 code units, which is what JavaScript string
// indices are, so columns from the tokenizer can be used as they are.
function toLsp(d: Diagnostic) {
  return {
    range: {
      start: { line: d.line - 1, character: d.column - 1 },
      end: { line: d.line - 1, character: d.column - 1 + d.length },
    },
    severity: d.severity === "error" ? 1 : 2,
    source: "inkwell",
    code: d.rule,
    message: d.message,
  };
}

function publish(uri: string): void {
  const text = documents.get(uri) ?? "";
  const diagnostics = lint(text, configFor(uri)).map(toLsp);
  send({ method: "textDocument/publishDiagnostics", params: { uri, diagnostics } });
}

function handle(message: Message): void {
  switch (message.method) {
    case "initialize":
      send({
        id: message.id,
        result: {
          capabilities: { textDocumentSync: 1 },
          serverInfo: { name: "inkwell" },
        },
      });
      break;
    case "textDocument/didOpen":
      documents.set(message.params.textDocument.uri, message.params.textDocument.text);
      publish(message.params.textDocument.uri);
      break;
    case "textDocument/didChange": {
      const { uri } = message.params.textDocument;
      const changes = message.params.contentChanges;
      documents.set(uri, changes[changes.length - 1].text);
      publish(uri);
      break;
    }
    case "textDocument/didClose": {
      const { uri } = message.params.textDocument;
      documents.delete(uri);
      send({ method: "textDocument/publishDiagnostics", params: { uri, diagnostics: [] } });
      break;
    }
    case "workspace/didChangeWatchedFiles":
      configs.clear();
      for (const uri of documents.keys()) publish(uri);
      break;
    case "shutdown":
      send({ id: message.id, result: null });
      break;
    case "exit":
      process.exit(0);
  }
}

let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf("\\r\\n\\r\\n");
    if (headerEnd === -1) return;
    const header = buffer.subarray(0, headerEnd).toString("ascii");
    const match = /Content-Length: (\\d+)/i.exec(header);
    if (!match) throw new Error("inkwell-server: missing Content-Length header");
    const start = headerEnd + 4;
    const end = start + Number(match[1]);
    if (buffer.length < end) return;
    const body = buffer.subarray(start, end).toString("utf8");
    buffer = buffer.subarray(end);
    handle(JSON.parse(body) as Message);
  }
});
`;

const serverR1Ts = `#!/usr/bin/env node
// A small Language Server Protocol endpoint over stdio. It implements just
// enough of the protocol for editors to show inkwell diagnostics as you
// type: initialize, full document sync, and shutdown.
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { type Config, loadConfig } from "./config.js";
import { lint } from "./lint.js";
import type { Diagnostic } from "./types.js";

interface Message {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: any;
}

const documents = new Map<string, string>();
const configs = new Map<string, Config>();

function send(message: object): void {
  const body = JSON.stringify({ jsonrpc: "2.0", ...message });
  process.stdout.write(\`Content-Length: \${Buffer.byteLength(body)}\\r\\n\\r\\n\${body}\`);
}

function configFor(uri: string): Config {
  const dir = dirname(fileURLToPath(uri));
  let config = configs.get(dir);
  if (!config) {
    config = loadConfig(dir);
    configs.set(dir, config);
  }
  return config;
}

function toLsp(d: Diagnostic) {
  return {
    range: {
      start: { line: d.line - 1, character: d.column - 1 },
      end: { line: d.line - 1, character: d.column - 1 + d.length },
    },
    severity: d.severity === "error" ? 1 : 2,
    source: "inkwell",
    code: d.rule,
    message: d.message,
  };
}

function publish(uri: string): void {
  const text = documents.get(uri) ?? "";
  const diagnostics = lint(text, configFor(uri)).map(toLsp);
  send({ method: "textDocument/publishDiagnostics", params: { uri, diagnostics } });
}

function handle(message: Message): void {
  switch (message.method) {
    case "initialize":
      send({
        id: message.id,
        result: {
          capabilities: { textDocumentSync: 1 },
          serverInfo: { name: "inkwell" },
        },
      });
      break;
    case "textDocument/didOpen":
      documents.set(message.params.textDocument.uri, message.params.textDocument.text);
      publish(message.params.textDocument.uri);
      break;
    case "textDocument/didChange": {
      const { uri } = message.params.textDocument;
      const changes = message.params.contentChanges;
      documents.set(uri, changes[changes.length - 1].text);
      publish(uri);
      break;
    }
    case "textDocument/didClose":
      documents.delete(message.params.textDocument.uri);
      break;
    case "shutdown":
      send({ id: message.id, result: null });
      break;
    case "exit":
      process.exit(0);
  }
}

let buffer = Buffer.alloc(0);
process.stdin.on("data", (chunk: Buffer) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf("\\r\\n\\r\\n");
    if (headerEnd === -1) return;
    const header = buffer.subarray(0, headerEnd).toString("ascii");
    const match = /Content-Length: (\\d+)/i.exec(header);
    if (!match) throw new Error("inkwell-server: missing Content-Length header");
    const start = headerEnd + 4;
    const end = start + Number(match[1]);
    if (buffer.length < end) return;
    const body = buffer.subarray(start, end).toString("utf8");
    buffer = buffer.subarray(end);
    handle(JSON.parse(body) as Message);
  }
});
`;

const rulesTestTs = `import { describe, expect, it } from "vitest";

import type { Config } from "../src/config.js";
import { lint } from "../src/lint.js";

const defaults: Config = { rules: {}, ignore: [] };

function check(text: string, config = defaults): string[] {
  return lint(text, config).map((d) => \`\${d.line}:\${d.column} \${d.rule}\`);
}

describe("passive-voice", () => {
  it("flags a form of 'to be' followed by a participle", () => {
    expect(check("The patch was reviewed on Tuesday.")).toEqual(["1:11 passive-voice"]);
  });

  it("looks past an adverb", () => {
    expect(check("It is usually written by hand.")).toEqual(["1:4 passive-voice"]);
  });

  it("leaves active sentences alone", () => {
    expect(check("Ana reviewed the patch.")).toEqual([]);
  });
});

describe("weasel-words", () => {
  it("flags padding words", () => {
    expect(check("This is very simple.")).toEqual(["1:9 weasel-words"]);
  });

  it("uses the configured word list", () => {
    const config: Config = {
      rules: { "weasel-words": { severity: "warning", options: { words: ["arguably"] } } },
      ignore: [],
    };
    expect(check("This is arguably very simple.", config)).toEqual(["1:9 weasel-words"]);
  });
});

describe("repeated-words", () => {
  it("flags a doubled word", () => {
    expect(check("Read the the docs.")).toEqual(["1:10 repeated-words"]);
  });

  it("ignores repeats across punctuation", () => {
    expect(check("Well, well. That went well.")).toEqual([]);
  });
});
`;

const snapshotTestTs = `import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { lint } from "../src/lint.js";

const dir = join(import.meta.dirname, "fixtures");

describe("fixtures", () => {
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    it(name, () => {
      const source = readFileSync(join(dir, name), "utf8");
      const lines = lint(source, { rules: {}, ignore: [] }).map(
        (d) => \`\${d.line}:\${d.column} \${d.severity} \${d.rule}: \${d.message}\`,
      );
      expect(lines.join("\\n")).toMatchSnapshot();
    });
  }
});
`;

const fixtureReleaseNotes = `# Release Notes for 2.4

This release was tested on three platforms and is very stable.

## What's new

- The importer is basically rewritten.
- Errors are shown next to the the line that caused them.
`;

const fixtureContributing = `# Contributing

Thanks for wanting to help! Patches are reviewed by a maintainer within a
week or so.

## Before You Start

Please open an issue first for anything larger than a typo. It is really
helpful to know what you plan to change.

\`\`\`sh
npm install
npm test -- --watch the the
\`\`\`

The \`npm test\` script is simply a wrapper around vitest.
`;

const snapshotFile = `// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

exports[\`fixtures > contributing.md 1\`] = \`
"4:30 warning passive-voice: \\"are reviewed\\" may be passive voice.
9:38 warning weasel-words: \\"really\\" adds little; consider removing it.
13:17 error repeated-words: \\"the\\" is repeated.
16:26 warning weasel-words: \\"simply\\" adds little; consider removing it."
\`;

exports[\`fixtures > release-notes.md 1\`] = \`
"3:14 warning passive-voice: \\"was tested\\" may be passive voice.
3:51 warning weasel-words: \\"very\\" adds little; consider removing it.
5:4 warning heading-case: Heading should be in title case: \\"What's New\\".
7:19 warning weasel-words: \\"basically\\" adds little; consider removing it.
8:10 warning passive-voice: \\"are shown\\" may be passive voice.
8:32 error repeated-words: \\"the\\" is repeated."
\`;
`;

const snapshotFileMasked = `// Vitest Snapshot v1, https://vitest.dev/guide/snapshot.html

exports[\`fixtures > contributing.md 1\`] = \`
"4:30 warning passive-voice: \\"are reviewed\\" may be passive voice.
9:38 warning weasel-words: \\"really\\" adds little; consider removing it.
16:26 warning weasel-words: \\"simply\\" adds little; consider removing it."
\`;

exports[\`fixtures > release-notes.md 1\`] = \`
"3:14 warning passive-voice: \\"was tested\\" may be passive voice.
3:51 warning weasel-words: \\"very\\" adds little; consider removing it.
5:4 warning heading-case: Heading should be in title case: \\"What's New\\".
7:19 warning weasel-words: \\"basically\\" adds little; consider removing it.
8:10 warning passive-voice: \\"are shown\\" may be passive voice.
8:32 error repeated-words: \\"the\\" is repeated."
\`;
`;

const rulesDoc = `# Rules

Every rule can be set to \`"off"\`, \`"warning"\` or \`"error"\` in
\`.inkwellrc.json\`. Options go in the second element of an array:
\`["warning", { ... }]\`.

## passive-voice

Flags a form of *to be* followed by a past participle: "was written",
"is being reviewed", "were quietly dropped". Passive voice isn't wrong,
but in instructions it hides who does what. "The config is loaded" leaves
the reader wondering whether they load it or the tool does.

This is a heuristic. It knows that regular participles end in *-ed* and
keeps a short list of irregular ones, so it misses some and occasionally
flags an adjective.

No options.

## weasel-words

Flags words that pad a sentence without changing its meaning: "very",
"quite", "basically", "simply".

Options:

- \`words\`: replace the built-in list.

## repeated-words

Flags the same word twice in a row with only whitespace in between, which
is almost always a typo from editing.

No options.
`;

const configurationDoc = `# Configuration recipes

inkwell reads the nearest \`.inkwellrc.json\`, starting in the directory of
the file being linted and walking up. The first file found wins; files are
not merged.

## A stricter config for user-facing docs

    {
      "rules": {
        "passive-voice": "error",
        "weasel-words": ["error", { "extend": ["arguably", "in order to"] }],
        "heading-case": ["warning", { "style": "sentence" }]
      }
    }

## Relaxed rules for a changelog

Changelogs are full of "was fixed" and "is now supported", and that's fine.
Put this next to \`CHANGELOG.md\`, or in a \`changelog/\` folder:

    {
      "rules": {
        "passive-voice": "off"
      }
    }

## Running in CI

Use \`--max-warnings 0\` to fail on any warning, and \`--format json\` when
something else will read the output:

    npx inkwell --max-warnings 0 README.md docs/*.md

## Linting text from another tool

\`--stdin\` reads from standard input, and the config is looked up from the
current directory:

    git show HEAD:docs/install.md | npx inkwell --stdin

## Writing for screen reader users

The pretty output never relies on colour alone: every line names its
severity in words, and \`NO_COLOR=1\` turns colour off entirely. If you are
wiring inkwell into another tool, prefer \`--format json\` over scraping
the pretty output.
`;

export const inkwell: RepoSeed = {
  owner: { org: "quill" },
  name: "inkwell",
  description:
    "A prose linter for Markdown: passive voice, weasel words, repeated words and consistent spelling, from the command line or your editor.",
  defaultBranch: "main",
  visibility: "public",
  delegates: ["jonas", "lena", "priya"],
  threshold: 2,
  seeding: 31,
  files: {
    "README.md": readme,
    LICENSE: license,
    "CHANGELOG.md": changelogRoot,
    "package.json": packageJson,
    "tsconfig.json": tsconfig,
    ".inkwellrc.json": inkwellrc,
    "docs/rules.md": rulesDoc,
    "src/cli.ts": cliTs,
    "src/config.ts": configTs,
    "src/format.ts": formatTs,
    "src/index.ts": indexTs,
    "src/lint.ts": lintTs,
    "src/tokenize.ts": tokenizeTs,
    "src/types.ts": typesTs,
    "src/rules/index.ts": rulesIndexRoot,
    "src/rules/passive-voice.ts": passiveVoiceTs,
    "src/rules/repeated-words.ts": repeatedWordsTs,
    "src/rules/weasel-words.ts": weaselWordsTs,
    "test/rules.test.ts": rulesTestTs,
  },
  root: {
    label: "root",
    message: `Initial commit

A prose linter that I've been running against Quill's style guide by hand
for a month. Three rules to start with: passive voice, weasel words and
repeated words. Configuration lives in .inkwellrc.json and is found by
walking up from the file being linted.`,
    author: "jonas",
    daysAgo: 352,
  },
  history: [
    {
      label: "heading-case",
      message: `Add the heading-case rule

Checks Markdown headings against title case (the default) or sentence
case. Small words such as "and", "of" and "the" stay lowercase in the
middle of a title.`,
      author: "jonas",
      daysAgo: 340,
      changes: {
        "src/rules/heading-case.ts": headingCaseTs,
        "src/rules/index.ts": rulesIndexHeading,
        "README.md": [
          [
            '| `repeated-words` | error | "the the" |\n',
            '| `repeated-words` | error | "the the" |\n| `heading-case` | warning | "## getting Started" |\n',
          ],
        ],
        "docs/rules.md": [
          [
            "is almost always a typo from editing.\n\nNo options.\n",
            `is almost always a typo from editing.

No options.

## heading-case

Checks that every Markdown heading uses the same capitalisation style. In
title case, small words ("a", "and", "of", "the", "with" and so on) stay
lowercase unless they start or end the heading.

Options:

- \`style\`: \`"title"\` (default) or \`"sentence"\`.
`,
          ],
        ],
      },
    },
    {
      label: "snapshots",
      message: `Add snapshot tests over fixture documents

Every Markdown file in test/fixtures is linted with the default config
and compared against a stored snapshot. Unit tests are good for edge
cases, but these catch rules interacting in ways nobody planned for.

Run "npm test -- -u" after an intentional change to a rule's output.`,
      author: "priya",
      daysAgo: 333,
      changes: {
        "test/snapshot.test.ts": snapshotTestTs,
        "test/fixtures/release-notes.md": fixtureReleaseNotes,
        "test/fixtures/contributing.md": fixtureContributing,
        "test/__snapshots__/snapshot.test.ts.snap": snapshotFile,
      },
    },
    {
      label: "weasel-options",
      message: `weasel-words: add extend and allow options

Replacing the whole list with "words" meant copying the defaults just to
add one word. "extend" adds to the built-in list and "allow" removes
from it.`,
      author: "jonas",
      daysAgo: 318,
      changes: {
        "src/rules/weasel-words.ts": [
          [
            "      (options.words as string[] | undefined) ?? DEFAULT_WEASELS,\n    );\n",
            `      (options.words as string[] | undefined) ?? DEFAULT_WEASELS,
    );
    for (const word of (options.extend as string[] | undefined) ?? []) {
      words.add(word.toLowerCase());
    }
    for (const word of (options.allow as string[] | undefined) ?? []) {
      words.delete(word.toLowerCase());
    }
`,
          ],
        ],
        "docs/rules.md": [
          [
            "- `words`: replace the built-in list.\n",
            "- `words`: replace the built-in list.\n- `extend`: add words to the built-in list.\n- `allow`: remove words from the built-in list, e.g. `[\"just\"]`.\n",
          ],
        ],
      },
    },
    {
      label: "mask-code",
      message: `Don't lint fenced code blocks or inline code

"npm run build build" in a shell example is not a typo we care about.
Code is replaced with spaces before tokenizing, so line and column
numbers for the prose around it stay the same.

Fixes the report about repeated-words firing inside code blocks.`,
      author: "priya",
      daysAgo: 301,
      changes: {
        "src/markdown.ts": markdownTs,
        "test/markdown.test.ts": markdownTestTs,
        "src/lint.ts": [
          [
            'import { tokenize } from "./tokenize.js";\n',
            'import { maskCode } from "./markdown.js";\nimport { tokenize } from "./tokenize.js";\n',
          ],
          [
            "  const tokens = tokenize(source);\n",
            "  const prose = maskCode(source);\n  const tokens = tokenize(prose);\n",
          ],
          [
            "rule.check({ source, tokens, options })",
            "rule.check({ source: prose, tokens, options })",
          ],
        ],
        "test/__snapshots__/snapshot.test.ts.snap": snapshotFileMasked,
      },
    },
    {
      label: "passive-red",
      message: `passive-voice: skip common words that only look like participles

"The light was red", "the patch is embed-ready" and "the build was
speed-tested" all ended in -ed and got flagged. Keep a short list of
words that end in -ed but are never participles.`,
      author: "lena",
      daysAgo: 289,
      changes: {
        "src/rules/passive-voice.ts": [
          [
            "function looksLikeParticiple(word: string): boolean {\n  return",
            `const NOT_PARTICIPLES = new Set([
  "bed", "bred", "embed", "fed", "feed", "need", "red", "seed", "shed", "shred",
  "sled", "speed", "steed", "tweed", "wed", "weed",
]);

function looksLikeParticiple(word: string): boolean {
  if (NOT_PARTICIPLES.has(word)) return false;
  return`,
          ],
        ],
        "test/rules.test.ts": [
          [
            '  it("leaves active sentences alone", () => {',
            `  it("doesn't mistake colours for participles", () => {
    expect(check("The warning light was red.")).toEqual([]);
  });

  it("leaves active sentences alone", () => {`,
          ],
        ],
      },
    },
    {
      label: "json-format",
      message: `cli: add --format json and colour the pretty output

JSON output is one entry per file with its diagnostics, which is what
editor plugins and CI annotation scripts want. The pretty format now
colours the severity when stdout is a terminal.`,
      author: "priya",
      daysAgo: 274,
      changes: {
        "src/format.ts": formatJsonTs,
        "src/cli.ts": [
          [
            'import { formatPretty } from "./format.js";',
            'import { type FileResult, formatJson, formatPretty } from "./format.js";',
          ],
          [
            "  --version                print the version and exit\n",
            "  --format <pretty|json>   output format (default: pretty)\n  --version                print the version and exit\n",
          ],
          [
            '      version: { type: "boolean" },\n',
            '      version: { type: "boolean" },\n      format: { type: "string", default: "pretty" },\n',
          ],
          [
            "  if (positionals.length === 0) {",
            `  if (values.format !== "pretty" && values.format !== "json") {
    process.stderr.write(\`inkwell: unknown format "\${values.format}"\\n\`);
    return 2;
  }
  if (positionals.length === 0) {`,
          ],
          ["  let errors = 0;\n", "  let errors = 0;\n  const results: FileResult[] = [];\n"],
          [
            "    process.stdout.write(formatPretty(file, diagnostics));\n",
            '    if (values.format === "pretty") process.stdout.write(formatPretty(file, diagnostics));\n    results.push({ file, diagnostics });\n',
          ],
          [
            "  return errors > 0 ? 1 : 0;",
            '  if (values.format === "json") process.stdout.write(formatJson(results));\n  return errors > 0 ? 1 : 0;',
          ],
        ],
        "README.md": [
          [
            "## Development\n",
            `## Output

By default inkwell prints one line per problem:

    docs/install.md:12:5  warning  "was copied" may be passive voice.  passive-voice

\`--format json\` prints an array of \`{ file, diagnostics }\` objects instead.

## Development
`,
          ],
        ],
      },
    },
    {
      label: "bump-0.2.0",
      message: `Release 0.2.0`,
      author: "jonas",
      daysAgo: 268,
      changes: {
        "package.json": [['"version": "0.1.0"', '"version": "0.2.0"']],
        "src/cli.ts": [['const VERSION = "0.1.0";', 'const VERSION = "0.2.0";']],
        "CHANGELOG.md": changelog020,
      },
    },
    {
      label: "spelling",
      message: `Add the consistent-spelling rule

Flags a word spelled one way early in a document and another way later:
"colour" then "color", "grey" then "gray". Whichever spelling appears
first wins. This doesn't take sides between British and American
English; it only asks you to pick one.`,
      author: "jonas",
      daysAgo: 251,
      changes: {
        "src/rules/consistent-spelling.ts": consistentSpellingTs,
        "src/rules/index.ts": rulesIndexSpelling,
        "README.md": [
          [
            '| `heading-case` | warning | "## getting Started" |\n',
            '| `heading-case` | warning | "## getting Started" |\n| `consistent-spelling` | warning | "colour" and "color" in one file |\n',
          ],
        ],
        "test/rules.test.ts": [
          [
            'describe("repeated-words", () => {',
            `describe("consistent-spelling", () => {
  it("keeps the first spelling it sees", () => {
    expect(check("The grey cat sat next to the gray dog.")).toEqual(["1:30 consistent-spelling"]);
  });
});

describe("repeated-words", () => {`,
          ],
        ],
      },
    },
    {
      label: "spelling-docs",
      message: `docs: describe consistent-spelling

Including what it deliberately doesn't do, since the first question
people ask is whether it enforces British spelling.`,
      author: "lena",
      daysAgo: 247,
      changes: {
        "docs/rules.md": [
          [
            '- `style`: `"title"` (default) or `"sentence"`.\n',
            `- \`style\`: \`"title"\` (default) or \`"sentence"\`.

## consistent-spelling

Flags a word that is spelled two different ways in the same document,
such as "colour" in the introduction and "color" in a table caption.
The first spelling in the document wins.

inkwell doesn't prefer British or American spelling. Mixing them is the
problem it looks for, because readers notice the switch even when both
spellings are correct.

No options.
`,
          ],
        ],
      },
    },
    {
      label: "config-validate",
      message: `config: reject unknown rule names

A typo such as "pasive-voice" used to be ignored, so the rule silently
kept its default severity. Now loading the config fails with a message
that names the closest known rule, and the CLI exits with status 2.`,
      author: "priya",
      daysAgo: 232,
      changes: {
        "src/config.ts": [
          [
            'import type { Severity } from "./types.js";\n',
            'import { rules as builtin } from "./rules/index.js";\nimport type { Severity } from "./types.js";\n',
          ],
          [
            'const FILENAME = ".inkwellrc.json";\n',
            `const FILENAME = ".inkwellrc.json";

export class ConfigError extends Error {}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return row[b.length];
}

function suggest(name: string): string {
  const [best] = builtin
    .map((rule) => ({ rule: rule.name, d: distance(name, rule.name) }))
    .sort((x, y) => x.d - y.d);
  return best && best.d <= 3 ? \`; did you mean "\${best.rule}"?\` : "";
}
`,
          ],
          [
            "  for (const [name, value] of Object.entries(raw.rules ?? {})) {\n",
            `  for (const [name, value] of Object.entries(raw.rules ?? {})) {
    if (!builtin.some((rule) => rule.name === name)) {
      throw new ConfigError(\`unknown rule "\${name}"\${suggest(name)}\`);
    }
`,
          ],
          [
            "  return parseConfig(readFileSync(path, \"utf8\"));",
            "  try {\n    return parseConfig(readFileSync(path, \"utf8\"));\n  } catch (error) {\n    if (error instanceof Error) error.message = `${path}: ${error.message}`;\n    throw error;\n  }",
          ],
        ],
        "src/cli.ts": [
          ['import { loadConfig } from "./config.js";', 'import { ConfigError, loadConfig } from "./config.js";'],
          [
            "    const diagnostics = lint(source, loadConfig(dirname(file)));\n",
            `    let config;
    try {
      config = loadConfig(dirname(file));
    } catch (error) {
      if (!(error instanceof ConfigError)) throw error;
      process.stderr.write(\`inkwell: \${error.message}\\n\`);
      return 2;
    }
    const diagnostics = lint(source, config);
`,
          ],
        ],
      },
    },
    {
      label: "repeated-allow",
      message: `repeated-words: allow "had had" and "that that" by default

Both are grammatical ("she had had enough", "the claim that that was
fine") and showed up in our release notes often enough to be annoying.
The list can be replaced with the new allow option.`,
      author: "kofi",
      daysAgo: 214,
      changes: {
        "src/rules/repeated-words.ts": [
          [
            "export const repeatedWords: Rule = {",
            'export const DEFAULT_ALLOW = ["had", "that"];\n\nexport const repeatedWords: Rule = {',
          ],
          [
            "  check({ tokens, source }) {\n",
            "  check({ tokens, source, options }) {\n    const allow = new Set(\n      ((options.allow as string[] | undefined) ?? DEFAULT_ALLOW).map((w) => w.toLowerCase()),\n    );\n",
          ],
          [
            "      if (prev.lower !== cur.lower) continue;",
            "      if (prev.lower !== cur.lower || allow.has(cur.lower)) continue;",
          ],
        ],
        "docs/rules.md": [
          [
            "is almost always a typo from editing.\n\nNo options.\n",
            `is almost always a typo from editing.

Options:

- \`allow\`: words that may be repeated. Defaults to \`["had", "that"]\`,
  as in "she had had enough".
`,
          ],
        ],
        "test/rules.test.ts": [
          [
            '  it("ignores repeats across punctuation", () => {',
            `  it("allows grammatical repeats", () => {
    expect(check("By then she had had enough.")).toEqual([]);
  });

  it("ignores repeats across punctuation", () => {`,
          ],
        ],
      },
    },
    {
      label: "no-color",
      message: `format: respect NO_COLOR and FORCE_COLOR

Several people run inkwell in terminals with custom palettes where the
yellow we picked has poor contrast. NO_COLOR (any non-empty value) turns
colour off, and FORCE_COLOR turns it on for CI logs that render ANSI.`,
      author: "lena",
      daysAgo: 199,
      changes: {
        "src/format.ts": [
          [
            "const color = process.stdout.isTTY;\n",
            `// See https://no-color.org. FORCE_COLOR wins so CI logs can opt in.
const color = process.env.FORCE_COLOR
  ? process.env.FORCE_COLOR !== "0"
  : !process.env.NO_COLOR && process.stdout.isTTY;
`,
          ],
        ],
      },
    },
    {
      label: "server",
      message: `Add inkwell-server, a minimal language server

Speaks just enough LSP over stdio for diagnostics as you type: full
document sync, publishDiagnostics, and a cleared problem list when a
document closes. Config files are cached per directory and the cache is
dropped when the editor reports a watched file changed.

Tested with Neovim's built-in client and Helix.`,
      author: "priya",
      daysAgo: 176,
      changes: {
        "src/server.ts": serverTs,
        "package.json": [
          [
            '"bin": { "inkwell": "dist/cli.js" },',
            '"bin": { "inkwell": "dist/cli.js", "inkwell-server": "dist/server.js" },',
          ],
        ],
      },
    },
    {
      label: "server-docs",
      message: `README: document editor integration`,
      author: "priya",
      daysAgo: 175,
      changes: {
        "README.md": [
          [
            "## Development\n",
            `## Editor integration

\`inkwell-server\` is a small language server that talks LSP over stdio.
Any editor with an LSP client can use it. For Neovim:

    vim.lsp.start({
      name = "inkwell",
      cmd = { "npx", "inkwell-server" },
      root_dir = vim.fs.root(0, { ".inkwellrc.json", ".git" }),
    })

For Helix, add it to \`languages.toml\`:

    [language-server.inkwell]
    command = "npx"
    args = ["inkwell-server"]

    [[language]]
    name = "markdown"
    language-servers = ["inkwell"]

## Development
`,
          ],
        ],
      },
    },
    {
      label: "heading-acronyms",
      message: `heading-case: leave acronyms alone

"Using the HTTP API" was "corrected" to "Using the Http Api". Words
written entirely in capitals (and digits) are now kept as they are in
both styles.`,
      author: "jonas",
      daysAgo: 160,
      changes: {
        "src/rules/heading-case.ts": [
          [
            "function titleCase(",
            "function isAcronym(word: string): boolean {\n  return word.length > 1 && /^[A-Z0-9]+$/.test(word);\n}\n\nfunction titleCase(",
          ],
          [
            "    if (i > 0 && i < words.length - 1 && SMALL.has(lower)) return lower;",
            "    if (isAcronym(w)) return w;\n    if (i > 0 && i < words.length - 1 && SMALL.has(lower)) return lower;",
          ],
          [
            "    return i === 0 ? capitalise(lower) : lower;",
            "    if (isAcronym(w)) return w;\n    return i === 0 ? capitalise(lower) : lower;",
          ],
        ],
        "docs/rules.md": [
          [
            "lowercase unless they start or end the heading.\n",
            "lowercase unless they start or end the heading. Words in capitals, such\nas API or HTML, are left alone in both styles.\n",
          ],
        ],
      },
    },
    {
      label: "bump-0.3.0",
      message: `Release 0.3.0`,
      author: "jonas",
      daysAgo: 150,
      changes: {
        "package.json": [['"version": "0.2.0"', '"version": "0.3.0"']],
        "src/cli.ts": [['const VERSION = "0.2.0";', 'const VERSION = "0.3.0";']],
        "CHANGELOG.md": changelog030,
      },
    },
    {
      label: "heading-code",
      message: `heading-case: compare words, not raw text

Inline code in a heading is masked with spaces before rules run, so
"## The \`lint\` function" reached the rule as "The        function" and
never matched the expected text, which collapses the spaces. Compare
the words instead.`,
      author: "jonas",
      daysAgo: 138,
      changes: {
        "src/rules/heading-case.ts": [
          ["      if (expected === text) return;", '      if (expected === words.join(" ")) return;'],
        ],
      },
    },
    {
      label: "tokenize-indexof",
      message: `tokenize: find line starts with indexOf

Walking the string one character at a time showed up as 30% of the
time spent linting a 2 MB changelog. indexOf is several times faster on
V8 and the code is no harder to read.

Before: 412 ms, after: 291 ms for the whole run on my machine.`,
      author: "yuki",
      daysAgo: 128,
      changes: {
        "src/tokenize.ts": [
          [
            '  for (let i = 0; i < source.length; i++) {\n    if (source[i] === "\\n") lineStarts.push(i + 1);\n  }\n',
            '  for (let i = source.indexOf("\\n"); i !== -1; i = source.indexOf("\\n", i + 1)) {\n    lineStarts.push(i + 1);\n  }\n',
          ],
        ],
      },
    },
    {
      label: "spelling-ise",
      message: `consistent-spelling: treat -ise/-ize as one family

Rather than listing organise, recognise, realise and the rest, look at
the suffix of every word ending in -ise/-ize and its inflections
(-ised, -ising, -isation, ...). The first one in the document decides.
Words with only one accepted spelling, such as "advise" and "size",
are excluded.`,
      author: "jonas",
      daysAgo: 112,
      changes: {
        "src/rules/consistent-spelling.ts": consistentSpellingIseTs,
        "test/rules.test.ts": [
          [
            '    expect(check("The grey cat sat next to the gray dog.")).toEqual(["1:30 consistent-spelling"]);\n  });\n',
            `    expect(check("The grey cat sat next to the gray dog.")).toEqual(["1:30 consistent-spelling"]);
  });

  it("checks -ise and -ize across word families", () => {
    expect(check("We organise the files. Organization matters.")).toEqual(["1:24 consistent-spelling"]);
  });

  it("ignores words with one spelling", () => {
    expect(check("We organise by size and advise against surprises.")).toEqual([]);
  });
`,
          ],
        ],
        "docs/rules.md": [
          [
            "The first spelling in the document wins.\n",
            "The first spelling in the document wins.\n\nFor -ise/-ize the whole word family counts: \"organise\" early on means\n\"organization\" and \"recognizing\" later are flagged. Words with a single\naccepted spelling (\"advise\", \"size\", \"surprise\") are never flagged.\n",
          ],
        ],
      },
    },
    {
      label: "cli-stdin",
      message: `cli: add --stdin

Reads Markdown from standard input, so inkwell can lint text that isn't
in a file yet (a commit message, a generated page, git show output).
The config is looked up from the current directory and diagnostics are
reported against "<stdin>".`,
      author: "self",
      daysAgo: 96,
      changes: {
        "src/cli.ts": [
          [
            "  --version                print the version and exit\n",
            "  --stdin                  read Markdown from standard input\n  --version                print the version and exit\n",
          ],
          [
            '      format: { type: "string", default: "pretty" },\n',
            '      format: { type: "string", default: "pretty" },\n      stdin: { type: "boolean" },\n',
          ],
          [
            "  if (positionals.length === 0) {",
            '  const files = values.stdin ? ["<stdin>"] : positionals;\n  if (files.length === 0) {',
          ],
          ["  for (const file of positionals) {", "  for (const file of files) {"],
          ['    const source = readFileSync(file, "utf8");', '    const source = readFileSync(values.stdin ? 0 : file, "utf8");'],
          [
            "      config = loadConfig(dirname(file));",
            "      config = loadConfig(values.stdin ? process.cwd() : dirname(file));",
          ],
        ],
      },
    },
    {
      label: "max-warnings",
      message: `cli: add --max-warnings

We want warnings to fail CI on the docs site but not on the changelog.
--max-warnings 0 fails on any warning; without the flag the behaviour is
unchanged and only errors fail the run.`,
      author: "oskar",
      daysAgo: 80,
      changes: {
        "src/cli.ts": [
          [
            "  --stdin                  read Markdown from standard input\n",
            "  --stdin                  read Markdown from standard input\n  --max-warnings <n>       fail when there are more than n warnings\n",
          ],
          [
            '      stdin: { type: "boolean" },\n',
            '      stdin: { type: "boolean" },\n      "max-warnings": { type: "string" },\n',
          ],
          ["  let errors = 0;\n", "  let errors = 0;\n  let warnings = 0;\n"],
          [
            '    errors += diagnostics.filter((d) => d.severity === "error").length;\n',
            '    errors += diagnostics.filter((d) => d.severity === "error").length;\n    warnings += diagnostics.filter((d) => d.severity === "warning").length;\n',
          ],
          [
            "  return errors > 0 ? 1 : 0;",
            '  const limit = values["max-warnings"];\n  const maxWarnings = limit === undefined ? Infinity : Number(limit);\n  return errors > 0 || warnings > maxWarnings ? 1 : 0;',
          ],
        ],
      },
    },
    {
      label: "server-codeactions",
      message: `server: offer quick fixes for suggestions

Diagnostics that carry suggestions (heading-case, repeated-words) now
come with a code action that applies them. The suggestions travel in the
diagnostic's data field, so the server doesn't need to re-lint to
answer a codeAction request.`,
      author: "priya",
      daysAgo: 47,
      changes: {
        "src/server.ts": [
          [
            "          capabilities: { textDocumentSync: 1 },",
            "          capabilities: { textDocumentSync: 1, codeActionProvider: true },",
          ],
          ["    message: d.message,\n  };", "    message: d.message,\n    data: d.suggestions,\n  };"],
          [
            '    case "shutdown":',
            `    case "textDocument/codeAction": {
      const { textDocument, context } = message.params;
      const actions = context.diagnostics.flatMap((d: any) =>
        ((d.data ?? []) as string[]).map((replacement) => ({
          title: replacement === "" ? "Remove repeated word" : \`Change to "\${replacement}"\`,
          kind: "quickfix",
          diagnostics: [d],
          edit: { changes: { [textDocument.uri]: [{ range: d.range, newText: replacement }] } },
        })),
      );
      send({ id: message.id, result: actions });
      break;
    }
    case "shutdown":`,
          ],
        ],
      },
    },
    {
      label: "bump-0.4.0",
      message: `Release 0.4.0`,
      author: "jonas",
      daysAgo: 38,
      changes: {
        "package.json": [['"version": "0.3.0"', '"version": "0.4.0"']],
        "src/cli.ts": [['const VERSION = "0.3.0";', 'const VERSION = "0.4.0";']],
        "CHANGELOG.md": changelog040,
      },
    },
    {
      label: "docs-config",
      message: `docs: add configuration recipes

Collects the configs people keep asking for in issues: stricter rules
for user-facing docs, passive voice off for changelogs, CI setups, and
a note on using inkwell with assistive technology.`,
      author: "mira",
      daysAgo: 30,
      changes: {
        "docs/configuration.md": configurationDoc,
        "README.md": [
          [
            "## Output\n",
            "More examples, including CI setups and a relaxed config for changelogs,\nare in [docs/configuration.md](docs/configuration.md).\n\n## Output\n",
          ],
        ],
      },
    },
    {
      label: "fence-crlf",
      message: `markdown: close code fences that end in \\r\\n

On files with Windows line endings the closing fence line is "\`\`\`\\r",
which never equalled "\`\`\`", so everything after the first code block
was treated as code and silently skipped.`,
      author: "priya",
      daysAgo: 18,
      changes: {
        "src/markdown.ts": [
          ['        if (line === "```") inFence = false;', '        if (line.trimEnd() === "```") inFence = false;'],
        ],
        "test/markdown.test.ts": [
          [
            '  it("blanks inline code", () => {',
            `  it("closes a fence that ends in \\\\r\\\\n", () => {
    const masked = maskCode("\`\`\`\\r\\ncode\\r\\n\`\`\`\\r\\nThe the end");
    expect(masked.endsWith("The the end")).toBe(true);
  });

  it("blanks inline code", () => {`,
          ],
        ],
      },
    },
    {
      label: "weasel-more",
      message: `weasel-words: add "arguably" and "essentially"

Both turned up a lot in the last round of Quill style guide reviews.`,
      author: "jonas",
      daysAgo: 6,
      changes: {
        "src/rules/weasel-words.ts": [
          [
            '  "just", "clearly", "obviously", "somewhat", "various", "several",\n',
            '  "just", "clearly", "obviously", "somewhat", "various", "several",\n  "arguably", "essentially",\n',
          ],
        ],
      },
    },
    {
      label: "changelog-unreleased",
      message: `CHANGELOG: start an Unreleased section`,
      author: "lena",
      daysAgo: 2,
      changes: {
        "CHANGELOG.md": [
          [
            "# Changelog\n\n",
            `# Changelog

## Unreleased

- Code fences with Windows line endings are closed properly; text after
  the first code block was being skipped.
- \`weasel-words\` flags "arguably" and "essentially".
- New docs page with configuration recipes.

`,
          ],
        ],
      },
    },
  ],
  issues: [
    {
      title: "repeated-words fires inside code blocks",
      author: "theo",
      daysAgo: 306,
      body: `Our README has a shell example with \`make build build-docs\`, which is fine, but also this:

\`\`\`
$ echo echo
\`\`\`

inkwell reports it as an error and fails CI. I don't think any rule should look inside fenced code, and probably not inside inline code either.

inkwell 0.1.0, Node 20.11.`,
      labels: ["bug"],
      assignees: ["priya"],
      state: "solved",
      closedHoursAfter: 130,
      comments: [
        {
          author: "jonas",
          body: "Agreed, nothing in code should be linted. Embarrassing that I didn't hit this on the style guide, which has no code in it at all.",
          hoursAfter: 3,
        },
        {
          author: "priya",
          body: "I'll take it. Plan: blank out code with spaces before tokenizing so line and column numbers don't shift. Parsing Markdown properly would be nicer but pulls in a dependency.",
          hoursAfter: 20,
          reactions: [{ emoji: "👍", by: ["jonas", "theo"] }],
        },
        {
          author: "theo",
          body: "Spaces is a nice trick. Indented code blocks (four spaces) will still be linted though?",
          hoursAfter: 26,
          replyTo: 1,
        },
        {
          author: "priya",
          body: "Yes, only fences for now. Indented blocks are ambiguous without a real parser (a list item continuation looks the same). If someone needs them we can revisit.",
          hoursAfter: 31,
          replyTo: 2,
        },
        {
          author: "priya",
          body: "Fixed on main, fenced and inline code are both skipped now.",
          hoursAfter: 130,
        },
      ],
    },
    {
      title: "passive-voice flags \"the ink was red\"",
      author: "wren",
      daysAgo: 293,
      body: `From the colophon of a book I'm setting:

> The paper was cream and the ink was red.

\`1:39 warning "was red" may be passive voice.\`

I know it's a heuristic, but colours are a pretty common case in my kind of writing.`,
      labels: ["bug", "good-first-issue"],
      state: "solved",
      closedHoursAfter: 100,
      comments: [
        {
          author: "jonas",
          body: "Ha. Anything ending in -ed counts as a participle. A small list of exceptions would cover the common ones: red, bed, need, speed, seed. Good first issue if anyone wants it.",
          hoursAfter: 5,
        },
        {
          author: "lena",
          body: "I'll do it, I've been meaning to get familiar with the rule code.",
          hoursAfter: 22,
        },
        {
          author: "wren",
          body: "\"embed\" too, please. Our docs say \"the font is embed-only\" a lot.",
          hoursAfter: 24,
          replyTo: 1,
          reactions: [{ emoji: "😅", by: ["lena"] }],
        },
      ],
    },
    {
      title: "Typo in rule name in .inkwellrc.json is silently ignored",
      author: "malik",
      daysAgo: 238,
      body: `I had \`"pasive-voice": "off"\` in my config for a week and wondered why I was still getting passive voice warnings. Nothing told me the rule name was wrong.

Unknown keys should be an error, ideally with a "did you mean".`,
      labels: ["bug"],
      assignees: ["priya"],
      state: "solved",
      closedHoursAfter: 150,
      comments: [
        {
          author: "priya",
          body: "Agreed. Error rather than warning? A warning would scroll past in CI.",
          hoursAfter: 6,
        },
        {
          author: "malik",
          body: "Error. A config that doesn't do what you wrote is worse than no config.",
          hoursAfter: 9,
          replyTo: 0,
          reactions: [{ emoji: "💯", by: ["priya", "jonas"] }],
        },
        {
          author: "priya",
          body: 'Done: `inkwell: /home/m/docs/.inkwellrc.json: unknown rule "pasive-voice"; did you mean "passive-voice"?` and exit status 2.',
          hoursAfter: 150,
        },
      ],
    },
    {
      title: "\"had had\" and \"that that\" are valid English",
      author: "kofi",
      daysAgo: 221,
      body: `Our release notes have sentences like "the claim that that version was stable" and repeated-words fails the build on them. Rewording is possible but feels like the linter is wrong here, not the sentence.

Could there be an allow list, with these two in it by default?`,
      labels: ["enhancement"],
      state: "solved",
      closedHoursAfter: 170,
      comments: [
        {
          author: "jonas",
          body: "I'd normally say rewrite the sentence, but \"had had\" is unavoidable in some tenses. OK with an allow option defaulting to had and that.",
          hoursAfter: 11,
        },
        {
          author: "lena",
          body: "What about \"is is\" as in \"what it is is a mess\"? Grammatical but almost always a typo in technical writing, so I'd leave it out of the defaults.",
          hoursAfter: 14,
        },
        {
          author: "kofi",
          body: "Agree on leaving \"is is\" out. I'll send the change.",
          hoursAfter: 30,
          replyTo: 1,
        },
      ],
    },
    {
      title: "Editor integration?",
      author: "mira",
      daysAgo: 192,
      body: "I'd love to see these warnings while I write rather than after I push. Is there a plan for a VS Code extension or a language server? Happy to help test, and to check that the diagnostics read well with a screen reader in VS Code's problems panel.",
      labels: ["enhancement", "question"],
      assignees: ["priya"],
      state: "solved",
      closedHoursAfter: 400,
      comments: [
        {
          author: "priya",
          body: "A language server is the most useful thing we could ship: one binary, every editor. I have a rough one that speaks enough LSP for diagnostics. Will open a patch this week.",
          hoursAfter: 8,
          reactions: [{ emoji: "🎉", by: ["mira", "jonas", "lena"] }],
        },
        {
          author: "jonas",
          body: "Let's not build a VS Code extension ourselves for now. A generic LSP client extension can launch `inkwell-server`.",
          hoursAfter: 12,
          replyTo: 0,
        },
        {
          author: "mira",
          body: "Tried the server in VS Code with NVDA. Messages read well because they start with the quoted phrase. One request: keep the rule name out of the message itself, it's already in `code` and screen readers announce both.",
          hoursAfter: 300,
        },
        {
          author: "priya",
          body: "It already is only in `code`, and I've added a test so it stays that way. Merged, closing this.",
          hoursAfter: 400,
          replyTo: 2,
        },
      ],
    },
    {
      title: "heading-case lowercases API and HTML",
      author: "ines",
      daysAgo: 166,
      body: `\`## Using the HTTP API\` gets the suggestion \`"Using the Http Api"\`. Same for HTML, CSS, JSON. Acronyms should be left as written.`,
      labels: ["bug"],
      state: "solved",
      closedHoursAfter: 140,
      comments: [
        {
          author: "jonas",
          body: "Yes. All-caps words of two letters or more will be kept as is. That misses things like \"macOS\" and \"iPhone\", but those need a dictionary, which is a bigger change.",
          hoursAfter: 20,
        },
        {
          author: "ines",
          body: "That covers 95% of my headings, thanks.",
          hoursAfter: 26,
          replyTo: 0,
        },
      ],
    },
    {
      title: "Read from stdin",
      author: "self",
      daysAgo: 99,
      body: "I'd like to lint commit messages in a hook before they're written to disk anywhere: `git log -1 --format=%B | inkwell --stdin`. Right now I write to a temp file first. Would a `--stdin` flag be welcome? I can send a patch.",
      labels: ["enhancement"],
      state: "solved",
      closedHoursAfter: 75,
      comments: [
        {
          author: "jonas",
          body: "Very welcome. Use the current directory for config lookup, and report diagnostics against `<stdin>` like eslint does.",
          hoursAfter: 4,
          reactions: [{ emoji: "👍", by: ["self"] }],
        },
        {
          author: "self",
          body: "Patch is up.",
          hoursAfter: 50,
        },
      ],
    },
    {
      title: "\"just\" is too noisy in technical docs",
      author: "self",
      daysAgo: 57,
      body: "In our API docs \"just\" is mostly used in the sense of \"only\" (\"returns just the headers\"), and weasel-words flags every one of them. Could \"just\" be dropped from the default list?",
      labels: ["question"],
      state: "closed",
      closedHoursAfter: 30,
      comments: [
        {
          author: "jonas",
          body: "I'd rather keep it: in prose it's one of the most common padding words, and \"returns only the headers\" reads better anyway. But you can drop it for your project:\n\n```json\n\"weasel-words\": [\"warning\", { \"allow\": [\"just\"] }]\n```",
          hoursAfter: 6,
        },
        {
          author: "lena",
          body: "+1 to keeping it. \"just\" also does real harm in instructions: \"just run the installer\" tells someone who is stuck that it should have been easy.",
          hoursAfter: 9,
          reactions: [{ emoji: "❤️", by: ["jonas", "mira"] }],
        },
        {
          author: "self",
          body: "Fair enough, the allow option works for us. Closing.",
          hoursAfter: 30,
        },
      ],
    },
    {
      title: "Should headings default to sentence case?",
      author: "jonas",
      daysAgo: 70,
      body: `heading-case defaults to title case because that's what Quill's own style guide used when I wrote it. Most docs I see now use sentence case, and so do the style guides people cite (GOV.UK, Microsoft, Google developer docs).

Proposal: switch the default to sentence case in 0.5. People who want title case set \`"style": "title"\`.

This will create a wave of new warnings for everyone on the default, so I'd like opinions first.`,
      labels: ["question", "breaking"],
      comments: [
        {
          author: "lena",
          body: "Strong yes. Sentence case is easier to read, especially for people with dyslexia, and it removes arguments about which words are \"small\".",
          hoursAfter: 3,
          reactions: [{ emoji: "👍", by: ["mira", "priya"] }],
        },
        {
          author: "wren",
          body: "Mild no. Book and magazine work is still mostly title case, and those are exactly the users who'll be surprised. Could the default come from the nearest config instead of being baked in?",
          hoursAfter: 8,
        },
        {
          author: "priya",
          body: "It already does come from the config, the question is only what happens when there isn't one. I'd go with sentence case and a very clear changelog entry.",
          hoursAfter: 10,
          replyTo: 1,
        },
        {
          author: "wren",
          body: "Fair. As long as the warning message says how to switch back, I won't fight it.",
          hoursAfter: 26,
          replyTo: 2,
        },
        {
          author: "mira",
          body: "Data point: of the 14 public repos I could find using inkwell, 11 already set `\"style\": \"sentence\"`.",
          hoursAfter: 50,
          reactions: [{ emoji: "📊", by: ["jonas"] }],
        },
        {
          author: "jonas",
          body: "Thanks all. I've opened a patch that switches the default and mentions the setting in the message.",
          hoursAfter: 90,
        },
      ],
    },
    {
      title: "Disable rules for a section with an HTML comment",
      author: "amara",
      daysAgo: 42,
      body: `Our field guide quotes farmers verbatim, and the quotes are full of "very" and "really". I don't want to turn weasel-words off for the whole file, only for the quotes. Something like:

\`\`\`md
<!-- inkwell-disable weasel-words -->
> It was really very dry that year.
<!-- inkwell-enable -->
\`\`\`

markdownlint and Vale both have something like this.`,
      labels: ["enhancement"],
      assignees: ["amara"],
      comments: [
        {
          author: "priya",
          body: "Makes sense. Comments are invisible in rendered Markdown, so they're the right place for this.",
          hoursAfter: 12,
        },
        {
          author: "amara",
          body: "I've started on it. Should a disable without a closing enable run to the end of the file?",
          hoursAfter: 100,
        },
        {
          author: "jonas",
          body: "Yes, that's what everyone expects from eslint. Maybe warn about it though, it's easy to forget the closing comment.",
          hoursAfter: 104,
          replyTo: 1,
        },
      ],
    },
    {
      title: "No warnings after the first code block on Windows",
      author: "felix",
      daysAgo: 23,
      body: `On Windows, with files checked out with CRLF line endings, inkwell reports nothing after the first fenced code block. Converting the file to LF fixes it.

Repro: any file with a code block followed by "the the". 0.4.0, Node 20.`,
      labels: ["bug"],
      assignees: ["priya"],
      state: "solved",
      closedHoursAfter: 110,
      comments: [
        {
          author: "priya",
          body: "Found it: the closing fence is \"```\\r\" and I compare with \"```\" exactly. Fix incoming. Thanks for the clear repro.",
          hoursAfter: 70,
        },
        {
          author: "felix",
          body: "Confirmed fixed on main, thanks!",
          hoursAfter: 130,
        },
      ],
    },
    {
      title: "inkwell-server uses a full core on large files",
      author: "yuki",
      daysAgo: 15,
      body: `Editing our 6,000-line CHANGELOG.md in Helix, inkwell-server sits at 100% CPU while I type and diagnostics lag a few seconds behind.

A profile shows almost all the time in lint(), called once per keystroke. Each run is ~180 ms on that file, and I type faster than that.

Two ideas: debounce didChange, and longer term, only re-lint the changed paragraphs.`,
      labels: ["perf"],
      assignees: ["priya"],
      comments: [
        {
          author: "priya",
          body: "Debouncing is the quick win, I'll do that first. Incremental linting is harder because consistent-spelling looks at the whole document.",
          hoursAfter: 5,
          reactions: [{ emoji: "👍", by: ["yuki"] }],
        },
        {
          author: "yuki",
          body: "consistent-spelling could keep the first-seen spelling per document and only re-check the rest. But agreed, debounce first.",
          hoursAfter: 9,
          replyTo: 0,
        },
      ],
    },
    {
      title: "Document every rule's options with an example",
      author: "lena",
      daysAgo: 8,
      body: "docs/rules.md lists the options but only has examples for some of them. Each rule should show a config snippet and one sentence that triggers it, and one that doesn't. Good first issue for anyone who wants to get to know the rules.",
      labels: ["docs", "good-first-issue"],
      comments: [
        {
          author: "hana",
          body: "I'd like to take this one, if nobody else has started.",
          hoursAfter: 30,
        },
        {
          author: "lena",
          body: "It's yours! Ping me for review.",
          hoursAfter: 33,
          replyTo: 0,
          reactions: [{ emoji: "🙌", by: ["hana"] }],
        },
      ],
    },
  ],
  patches: [
    {
      title: "Add inkwell-server, a minimal language server",
      author: "priya",
      daysAgo: 183,
      labels: ["enhancement"],
      state: "merged",
      revisions: [
        {
          description:
            "Adds `inkwell-server`, which speaks enough LSP over stdio to publish diagnostics as you type. Full document sync only. Tested with Neovim and Helix; I don't have VS Code installed, so testing there would be welcome.",
          hoursAfter: 0,
          commits: [
            {
              message: `Add inkwell-server

A minimal language server: initialize, full document sync and
publishDiagnostics.`,
              author: "priya",
              daysAgo: 183,
              changes: {
                "src/server.ts": serverR1Ts,
                "package.json": [
                  [
                    '"bin": { "inkwell": "dist/cli.js" },',
                    '"bin": { "inkwell": "dist/cli.js", "inkwell-server": "dist/server.js" },',
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "jonas",
              hoursAfter: 20,
              summary: "Small and readable, thank you. Two behaviour questions.",
              comments: [
                {
                  body: "Configs are cached forever, so editing `.inkwellrc.json` needs an editor restart. Could we clear this on `workspace/didChangeWatchedFiles`?",
                  path: "src/server.ts",
                  line: 32,
                },
                {
                  body: "Do we need to tell the editor anything here? I think Neovim keeps the old diagnostics around after the buffer is closed.",
                  path: "src/server.ts",
                  line: 78,
                },
              ],
            },
            {
              author: "lena",
              hoursAfter: 30,
              summary: "Tried it in VS Code with a generic LSP extension: works.",
              comments: [
                {
                  body: "Worth a comment that `character` is in UTF-16 code units and why that matches our columns. Someone will \"fix\" this to count code points one day.",
                  path: "src/server.ts",
                  line: 40,
                  endLine: 41,
                },
              ],
            },
          ],
        },
        {
          description:
            "Clears config cache on watched file changes, publishes empty diagnostics on close, and explains the UTF-16 columns. Also adds README instructions for Neovim and Helix.",
          hoursAfter: 170,
          fromHistory: ["server", "server-docs"],
          reviews: [
            {
              author: "jonas",
              hoursAfter: 4,
              verdict: "accept",
              summary: "Lovely. Merging.",
              comments: [
                {
                  body: "Thanks, this is exactly what I had in mind.",
                  path: "src/server.ts",
                  line: 86,
                  resolved: true,
                },
              ],
            },
            {
              author: "lena",
              hoursAfter: 6,
              verdict: "accept",
              summary: "The comment on positions is great.",
            },
          ],
          comments: [
            {
              author: "mira",
              body: "Works in VS Code with NVDA too. Diagnostics are announced cleanly.",
              hoursAfter: 10,
              reactions: [{ emoji: "🎉", by: ["priya"] }],
            },
          ],
        },
      ],
    },
    {
      title: "cli: add --stdin",
      author: "self",
      daysAgo: 97,
      labels: ["enhancement"],
      state: "merged",
      revisions: [
        {
          description:
            "Reads Markdown from standard input when `--stdin` is given. Config is looked up from the current directory, and diagnostics are reported against `<stdin>`.\n\nCloses the \"Read from stdin\" issue.",
          hoursAfter: 0,
          fromHistory: ["cli-stdin"],
          reviews: [
            {
              author: "priya",
              hoursAfter: 9,
              verdict: "accept",
              summary: "Thanks! Works with `git log -1 --format=%B | node dist/cli.js --stdin`.",
              comments: [
                {
                  body: "Nit for later: positionals are silently ignored with `--stdin`. Maybe an error if both are given? Not blocking.",
                  path: "src/cli.ts",
                  line: 44,
                },
              ],
            },
            {
              author: "jonas",
              hoursAfter: 22,
              verdict: "accept",
              summary: "LGTM.",
            },
          ],
        },
      ],
    },
    {
      title: "Add a readability rule based on Flesch reading ease",
      author: "theo",
      daysAgo: 141,
      labels: ["enhancement"],
      state: "archived",
      revisions: [
        {
          description:
            "Adds `readability`, which warns when a paragraph's Flesch reading ease score drops below a threshold (default 40). Syllables are counted with a vowel-group heuristic.",
          hoursAfter: 0,
          commits: [
            {
              message: `Add the readability rule

Warns when a paragraph scores below 40 on the Flesch reading ease
scale. The threshold is configurable with the "min" option.`,
              author: "theo",
              daysAgo: 141,
              changes: {
                "src/rules/readability.ts": `import type { Finding, Rule } from "../types.js";

function syllables(word: string): number {
  const groups = word.toLowerCase().replace(/e$/, "").match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 0);
}

export const readability: Rule = {
  name: "readability",
  description: "Warns about paragraphs with a low Flesch reading ease score.",
  defaultSeverity: "warning",
  check({ source, options }) {
    const min = (options.min as number | undefined) ?? 40;
    const found: Finding[] = [];
    let line = 1;
    for (const paragraph of source.split(/\\n\\s*\\n/)) {
      const words = paragraph.match(/[\\p{L}']+/gu) ?? [];
      const sentences = Math.max(1, (paragraph.match(/[.!?]+/g) ?? []).length);
      if (words.length >= 20) {
        const total = words.reduce((n, w) => n + syllables(w), 0);
        const score = 206.835 - 1.015 * (words.length / sentences) - 84.6 * (total / words.length);
        if (score < min) {
          found.push({
            message: \`Paragraph is hard to read (Flesch score \${score.toFixed(0)}, aim for \${min} or more).\`,
            line,
            column: 1,
            length: paragraph.indexOf("\\n") === -1 ? paragraph.length : paragraph.indexOf("\\n"),
          });
        }
      }
      line += paragraph.split("\\n").length + 1;
    }
    return found;
  },
};
`,
                "src/rules/index.ts": `import type { Rule } from "../types.js";
import { consistentSpelling } from "./consistent-spelling.js";
import { headingCase } from "./heading-case.js";
import { passiveVoice } from "./passive-voice.js";
import { readability } from "./readability.js";
import { repeatedWords } from "./repeated-words.js";
import { weaselWords } from "./weasel-words.js";

export const rules: Rule[] = [
  consistentSpelling,
  headingCase,
  passiveVoice,
  readability,
  repeatedWords,
  weaselWords,
];
`,
              },
            },
          ],
          reviews: [
            {
              author: "jonas",
              hoursAfter: 30,
              verdict: "reject",
              summary:
                "Thank you for the careful work, but I don't think this belongs in inkwell. Reading-ease scores were designed for school texts in the 1940s; on technical docs they mostly punish long words like \"configuration\" that the reader already knows. Every other rule points at a phrase you can change. This one gives a number and leaves you guessing.",
              comments: [
                {
                  body: "The line counting goes off when paragraphs are separated by more than one blank line, since split() eats them. Moot if we don't merge, but worth knowing if you publish this as a plugin.",
                  path: "src/rules/readability.ts",
                  line: 31,
                },
              ],
            },
          ],
          comments: [
            {
              author: "lena",
              body: "I agree with jonas. Readability scores also rate plain language for people with cognitive disabilities as \"easy\" whether or not it's clear, which is misleading.",
              hoursAfter: 34,
            },
            {
              author: "theo",
              body: "Fair points, especially the one about not saying what to change. I'll publish it as a separate package if there's interest. Archiving.",
              hoursAfter: 50,
              reactions: [{ emoji: "❤️", by: ["jonas", "lena"] }],
            },
          ],
        },
      ],
    },
    {
      title: "heading-case: default to sentence case",
      author: "jonas",
      daysAgo: 66,
      labels: ["breaking"],
      state: "open",
      revisions: [
        {
          description:
            "Switches heading-case's default style from title to sentence case, as discussed in the issue. Projects that want title case set `\"style\": \"title\"`.",
          hoursAfter: 0,
          commits: [
            {
              message: `heading-case: default to sentence case

Most documentation style guides now use sentence case for headings.
Projects that want title case can keep it with "style": "title".`,
              author: "jonas",
              daysAgo: 66,
              changes: {
                "src/rules/heading-case.ts": [
                  ['?? "title";', '?? "sentence";'],
                ],
                "docs/rules.md": [
                  [
                    '- `style`: `"title"` (default) or `"sentence"`.',
                    '- `style`: `"sentence"` (default) or `"title"`.',
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "lena",
              hoursAfter: 5,
              verdict: "accept",
              summary: "Yes please.",
            },
            {
              author: "wren",
              hoursAfter: 20,
              summary: "Fine with the change, but the message needs to say how to get title case back.",
              comments: [
                {
                  body: "This is the line people will see in their terminal after upgrading. Something like `Heading should be in sentence case (set \"style\" to change)`?",
                  path: "src/rules/heading-case.ts",
                  line: 50,
                },
              ],
            },
          ],
        },
        {
          description:
            "The message now names the setting, and the snapshot and README are updated. Still waiting on a second delegate before merging since it's a breaking change.",
          hoursAfter: 40,
          commits: [
            {
              message: `heading-case: say how to change the style in the message`,
              author: "jonas",
              daysAgo: 64,
              changes: {
                "src/rules/heading-case.ts": [
                  [
                    "        message: `Heading should be in ${style} case: \"${expected}\".`,",
                    "        message: `Heading should be in ${style} case (see the \"style\" option): \"${expected}\".`,",
                  ],
                ],
                "README.md": [
                  [
                    '| `heading-case` | warning | "## getting Started" |',
                    '| `heading-case` | warning | "## Getting Started" (sentence case by default) |',
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "wren",
              hoursAfter: 6,
              verdict: "accept",
              summary: "Thanks, that's clear.",
              comments: [
                {
                  body: "👍",
                  path: "src/rules/heading-case.ts",
                  line: 50,
                  resolved: true,
                },
              ],
            },
          ],
          comments: [
            {
              author: "priya",
              body: "I'll merge this after 0.4.x is out, so it lands in 0.5 with the changelog entry.",
              hoursAfter: 30,
            },
          ],
        },
      ],
    },
    {
      title: "Support <!-- inkwell-disable --> comments",
      author: "amara",
      daysAgo: 34,
      labels: ["enhancement"],
      state: "draft",
      revisions: [
        {
          description:
            "Work in progress. `<!-- inkwell-disable -->` turns all rules off until `<!-- inkwell-enable -->`; `<!-- inkwell-disable weasel-words passive-voice -->` turns off just those. Still to do: warn about a disable that is never closed, docs.",
          hoursAfter: 0,
          commits: [
            {
              message: `Skip diagnostics inside inkwell-disable comments`,
              author: "amara",
              daysAgo: 34,
              changes: {
                "src/disable.ts": `const DIRECTIVE = /<!--\\s*inkwell-(disable|enable)((?:\\s+[\\w-]+)*)\\s*-->/;

interface Range {
  from: number;
  to: number;
  rules: Set<string> | undefined;
}

export function disabledRanges(source: string): Range[] {
  const ranges: Range[] = [];
  let open: Range | undefined;
  source.split("\\n").forEach((text, index) => {
    const match = DIRECTIVE.exec(text);
    if (!match) return;
    const line = index + 1;
    if (match[1] === "disable" && !open) {
      const names = match[2].trim().split(/\\s+/).filter(Boolean);
      open = { from: line, to: Infinity, rules: names.length ? new Set(names) : undefined };
      ranges.push(open);
    } else if (match[1] === "enable" && open) {
      open.to = line;
      open = undefined;
    }
  });
  return ranges;
}

export function isDisabled(ranges: Range[], rule: string, line: number): boolean {
  return ranges.some((r) => line > r.from && line < r.to && (!r.rules || r.rules.has(rule)));
}
`,
                "src/lint.ts": [
                  [
                    'import { maskCode } from "./markdown.js";\n',
                    'import { disabledRanges, isDisabled } from "./disable.js";\nimport { maskCode } from "./markdown.js";\n',
                  ],
                  [
                    "  const diagnostics: Diagnostic[] = [];\n",
                    "  const diagnostics: Diagnostic[] = [];\n  const disabled = disabledRanges(source);\n",
                  ],
                  [
                    "      diagnostics.push({ ...found, rule: rule.name, severity });",
                    "      if (isDisabled(disabled, rule.name, found.line)) continue;\n      diagnostics.push({ ...found, rule: rule.name, severity });",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "priya",
              hoursAfter: 26,
              summary: "Nice start! A couple of notes for when you pick it up again.",
              comments: [
                {
                  body: "A second `disable` while one is open is ignored. Nested or overlapping ones for different rules seem reasonable to support, e.g. disable weasel-words for a section and passive-voice for one quote inside it.",
                  path: "src/disable.ts",
                  line: 16,
                },
                {
                  body: "Should a directive inside a code block count? Since this runs on `source` rather than the masked text, a docs page explaining the directive would disable itself.",
                  path: "src/lint.ts",
                  line: 12,
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "server: debounce linting on change",
      author: "priya",
      daysAgo: 12,
      labels: ["perf"],
      state: "open",
      revisions: [
        {
          description:
            "Wait 150 ms after the last change before re-linting, so typing a word triggers one lint instead of five. didOpen still lints immediately.",
          hoursAfter: 0,
          commits: [
            {
              message: `server: debounce didChange by 150 ms`,
              author: "priya",
              daysAgo: 12,
              changes: {
                "src/server.ts": [
                  [
                    "function publish(uri: string): void {",
                    `const timers = new Map<string, NodeJS.Timeout>();

function schedule(uri: string): void {
  clearTimeout(timers.get(uri));
  timers.set(
    uri,
    setTimeout(() => {
      timers.delete(uri);
      publish(uri);
    }, 150),
  );
}

function publish(uri: string): void {`,
                  ],
                  [
                    "      documents.set(uri, changes[changes.length - 1].text);\n      publish(uri);",
                    "      documents.set(uri, changes[changes.length - 1].text);\n      schedule(uri);",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "yuki",
              hoursAfter: 8,
              summary: "Tested on the 6,000-line changelog: CPU drops from a full core to short spikes. One bug.",
              comments: [
                {
                  body: "If the document is closed within 150 ms of a change, this timer still fires and publishes diagnostics for a closed file, which re-adds them to the problems list. didClose should cancel it.",
                  path: "src/server.ts",
                  line: 94,
                },
                {
                  body: "150 ms feels right while typing. Could we make it configurable through initializationOptions? Slower machines may want more.",
                  path: "src/server.ts",
                  line: 62,
                },
              ],
            },
          ],
        },
        {
          description:
            "Cancels the pending timer on didClose, and reads the delay from `initializationOptions.debounceMs` (default 150).",
          hoursAfter: 26,
          commits: [
            {
              message: `server: cancel pending lint on close, make delay configurable`,
              author: "priya",
              daysAgo: 11,
              changes: {
                "src/server.ts": [
                  [
                    "const timers = new Map<string, NodeJS.Timeout>();\n",
                    "const timers = new Map<string, NodeJS.Timeout>();\nlet debounceMs = 150;\n",
                  ],
                  ["    }, 150),", "    }, debounceMs),"],
                  [
                    '    case "initialize":\n',
                    '    case "initialize":\n      debounceMs = message.params?.initializationOptions?.debounceMs ?? debounceMs;\n',
                  ],
                  [
                    "      documents.delete(uri);\n",
                    "      clearTimeout(timers.get(uri));\n      timers.delete(uri);\n      documents.delete(uri);\n",
                  ],
                ],
              },
            },
          ],
          reviews: [
            {
              author: "yuki",
              hoursAfter: 5,
              verdict: "accept",
              summary: "Works nicely. The closed-document case is fixed.",
            },
            {
              author: "jonas",
              hoursAfter: 20,
              summary: "Looks good. Can you add the option to the README's editor section before merging?",
            },
          ],
          comments: [
            {
              author: "self",
              body: "Tried this branch in Neovim on a long design doc, typing feels much smoother. Thanks!",
              hoursAfter: 40,
              reactions: [{ emoji: "🙏", by: ["priya"] }],
            },
          ],
        },
      ],
    },
  ],
  releases: [
    {
      tag: "v0.2.0",
      at: "bump-0.2.0",
      title: "inkwell 0.2.0",
      notes: `- New rule: \`heading-case\`, title or sentence case for headings
- \`weasel-words\` gains \`extend\` and \`allow\` options
- Code blocks and inline code are no longer linted
- \`passive-voice\` no longer flags colours such as "was red"
- \`--format json\` for editors and CI`,
      author: "jonas",
      daysAgo: 268,
      artifacts: [{ name: "quill-inkwell-0.2.0.tgz", sizeBytes: 14_802 }],
    },
    {
      tag: "v0.3.0",
      at: "bump-0.3.0",
      title: "inkwell 0.3.0",
      notes: `The editor release.

- \`inkwell-server\`: diagnostics as you type in any editor with an LSP client. See the README for Neovim and Helix setup.
- New rule: \`consistent-spelling\`
- Unknown rule names in \`.inkwellrc.json\` are errors, with a suggestion
- \`repeated-words\` allows "had had" and "that that"
- \`NO_COLOR\` and \`FORCE_COLOR\` are respected
- \`heading-case\` leaves acronyms alone

Thanks to kofi, malik, ines and mira for reports and patches.`,
      author: "jonas",
      daysAgo: 149,
      artifacts: [{ name: "quill-inkwell-0.3.0.tgz", sizeBytes: 19_455 }],
    },
    {
      tag: "v0.4.0",
      at: "bump-0.4.0",
      title: "inkwell 0.4.0",
      notes: `- \`consistent-spelling\` checks -ise/-ize across whole word families
- \`--stdin\` and \`--max-warnings\`
- Quick fixes in \`inkwell-server\` for diagnostics with a suggestion
- \`heading-case\` no longer reports headings with inline code
- Faster on long documents

Heads up: 0.5 will probably switch \`heading-case\` to sentence case by default. Set \`"style": "title"\` now if you want to keep title case.`,
      author: "jonas",
      daysAgo: 37,
      artifacts: [{ name: "quill-inkwell-0.4.0.tgz", sizeBytes: 22_310 }],
    },
  ],
};
