import type { ElementContent, Root } from "hast";

import onigurumaWASMUrl from "vscode-oniguruma/release/onig.wasm?url";
import sourceAsciiDoc from "@wooorm/starry-night/text.html.asciidoc";
import sourceDockerfile from "@wooorm/starry-night/source.dockerfile";
import sourceErlang from "@wooorm/starry-night/source.erlang";
import sourceSolidity from "@wooorm/starry-night/source.solidity";
import sourceSvelte from "@wooorm/starry-night/source.svelte";
import sourceSass from "@wooorm/starry-night/source.sass";
import sourceToml from "@wooorm/starry-night/source.toml";
import sourceTsx from "@wooorm/starry-night/source.tsx";
import sourceNix from "@wooorm/starry-night/source.nix";
import sourceGitconfig from "@wooorm/starry-night/source.gitconfig";
import sourceGitignore from "@wooorm/starry-night/source.gitignore";
import sourceGitrevlist from "@wooorm/starry-night/source.git-revlist";
import sourceGitattributes from "@wooorm/starry-night/source.gitattributes";
import sourceJson from "@wooorm/starry-night/source.json";
import sourceNpmrc from "@wooorm/starry-night/source.ini.npmrc";
import sourceGradle from "@wooorm/starry-night/source.groovy.gradle";
import sourceBatchfile from "@wooorm/starry-night/source.batchfile";
import sourceEditorconfig from "@wooorm/starry-night/source.editorconfig";
import sourceHaproxyConfig from "@wooorm/starry-night/source.haproxy-config";
import sourceDotenv from "@wooorm/starry-night/source.dotenv";
import sourceZig from "@wooorm/starry-night/source.zig";
import textHtmlVue from "@wooorm/starry-night/text.html.vue";
import textHtmlDjango from "@wooorm/starry-night/text.html.django";
import textRobotsTxt from "@wooorm/starry-night/text.robots-txt";
import textZoneFile from "@wooorm/starry-night/text.zone_file";
import etc from "@wooorm/starry-night/etc";
import goMod from "@wooorm/starry-night/go.mod";
import goSum from "@wooorm/starry-night/go.sum";

import { createStarryNight, common, type Grammar } from "@wooorm/starry-night";

export { type Root };

export const grammars = [
  ...common,
  sourceAsciiDoc,
  sourceToml,
  sourceErlang,
  sourceSolidity,
  sourceSvelte,
  sourceSass,
  sourceTsx,
  sourceDockerfile,
  sourceNix,
  sourceGitconfig,
  sourceGitignore,
  sourceGitrevlist,
  sourceGitattributes,
  sourceNpmrc,
  sourceGradle,
  sourceBatchfile,
  sourceEditorconfig,
  sourceHaproxyConfig,
  sourceDotenv,
  sourceZig,
  textHtmlVue,
  textHtmlDjango,
  textRobotsTxt,
  textZoneFile,
  etc,
  goMod,
  goSum,
  {
    extensions: [".hintrc"],
    names: ["json"],
    patterns: [sourceJson],
    scopeName: "source.json",
  },
  {
    extensions: [
      ".npmignore",
      ".eslintignore",
      ".dockerignore",
      ".nuxtignore",
      ".vscodeignore",
    ],
    names: ["ignore"],
    patterns: [sourceGitignore],
    scopeName: "source.gitignore",
  },
  {
    extensions: [".sample", ".example", ".template"],
    names: [".env.sample", ".env.example", ".env.template"],
    patterns: [sourceDotenv],
    scopeName: "source.dotenv",
  },
  {
    extensions: [".mod"],
    names: ["go.mod"],
    patterns: [goMod],
    scopeName: "go.mode",
  },
  {
    extensions: [".sum"],
    names: ["go.sum"],
    patterns: [goSum],
    scopeName: "go.sum",
  },
  // A grammar that doesn't do any parsing, but needed for files without a known filetype.
  {
    extensions: [""],
    names: ["raw-format"],
    patterns: [],
    scopeName: "text.raw",
  },
] satisfies Grammar[];

let starryNight: Awaited<ReturnType<typeof createStarryNight>>;

export async function highlight(
  content: string,
  grammar: string,
): Promise<Root> {
  if (starryNight === undefined) {
    starryNight = await createStarryNight(grammars, {
      getOnigurumaUrlFetch: () => new URL(onigurumaWASMUrl, import.meta.url),
    });
  }
  const scope = starryNight.flagToScope(grammar);
  return starryNight.highlight(content, scope ?? "text.raw");
}

export function lineNumbersGutter(tree: Root) {
  const replacement: ElementContent[] = [];
  const search = /\r?\n|\r/g;
  let index = -1;
  let start = 0;
  let startTextRemainder = "";
  let lineNumber = 0;

  while (++index < tree.children.length) {
    const child = tree.children[index];

    if (child.type === "text") {
      let textStart = 0;
      let match = search.exec(child.value);

      while (match) {
        // Nodes in this line.
        const line = tree.children.slice(start, index) as ElementContent[];

        // Prepend text from a partial matched earlier text.
        if (startTextRemainder) {
          line.unshift({ type: "text", value: startTextRemainder });
          startTextRemainder = "";
        }

        // Append text from this text.
        if (match.index > textStart) {
          line.push({
            type: "text",
            value: child.value.slice(textStart, match.index),
          });
        }

        // Add a line, with its eol inside the line's content so that copying
        // the line keeps it. The eol is wrapped in a span because the HTML
        // parser drops a newline that directly follows a `<pre>` start tag.
        line.push({
          type: "element",
          tagName: "span",
          properties: {},
          children: [{ type: "text", value: match[0] }],
        });
        lineNumber += 1;
        replacement.push(createLine(line, lineNumber));

        start = index + 1;
        textStart = match.index + match[0].length;
        match = search.exec(child.value);
      }

      // If we matched, make sure to not drop the text after the last line ending.
      if (start === index + 1) {
        startTextRemainder = child.value.slice(textStart);
      }
    }
  }

  const line = tree.children.slice(start) as ElementContent[];
  // Prepend text from a partial matched earlier text.
  if (startTextRemainder) {
    line.unshift({ type: "text", value: startTextRemainder });
  }

  if (line.length > 0) {
    lineNumber += 1;
    replacement.push(createLine(line, lineNumber));
  }

  // Replace children with new array.
  tree.children = replacement;

  return tree;
}

function createLine(children: ElementContent[], line: number): ElementContent {
  return {
    type: "element",
    tagName: "tr",
    properties: {
      class: "line",
      id: "L" + line,
    },
    children: [
      {
        type: "element",
        tagName: "td",
        properties: {
          className: ["line-number"],
        },
        children: [
          {
            type: "element",
            tagName: "a",
            properties: { href: "#L" + line },
            children: [{ type: "text", value: line.toString() }],
          },
        ],
      },
      {
        type: "element",
        tagName: "td",
        properties: {
          className: ["line-content"],
        },
        children: [
          {
            type: "element",
            tagName: "pre",
            properties: {
              className: ["content"],
            },
            children,
          },
        ],
      },
    ],
  };
}
