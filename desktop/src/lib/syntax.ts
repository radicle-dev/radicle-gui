import type { Root } from "hast";

import { common, createStarryNight, type Grammar } from "@wooorm/starry-night";
import etc from "@wooorm/starry-night/etc";
import goMod from "@wooorm/starry-night/go.mod";
import goSum from "@wooorm/starry-night/go.sum";
import sourceBatchfile from "@wooorm/starry-night/source.batchfile";
import sourceDockerfile from "@wooorm/starry-night/source.dockerfile";
import sourceDotenv from "@wooorm/starry-night/source.dotenv";
import sourceEditorconfig from "@wooorm/starry-night/source.editorconfig";
import sourceErlang from "@wooorm/starry-night/source.erlang";
import sourceGitrevlist from "@wooorm/starry-night/source.git-revlist";
import sourceGitattributes from "@wooorm/starry-night/source.gitattributes";
import sourceGitconfig from "@wooorm/starry-night/source.gitconfig";
import sourceGitignore from "@wooorm/starry-night/source.gitignore";
import sourceGradle from "@wooorm/starry-night/source.groovy.gradle";
import sourceHaproxyConfig from "@wooorm/starry-night/source.haproxy-config";
import sourceNpmrc from "@wooorm/starry-night/source.ini.npmrc";
import sourceJson from "@wooorm/starry-night/source.json";
import sourceNix from "@wooorm/starry-night/source.nix";
import sourceSass from "@wooorm/starry-night/source.sass";
import sourceSolidity from "@wooorm/starry-night/source.solidity";
import sourceSvelte from "@wooorm/starry-night/source.svelte";
import sourceToml from "@wooorm/starry-night/source.toml";
import sourceTsx from "@wooorm/starry-night/source.tsx";
import sourceZig from "@wooorm/starry-night/source.zig";
import sourceAsciiDoc from "@wooorm/starry-night/text.html.asciidoc";
import textHtmlDjango from "@wooorm/starry-night/text.html.django";
import textHtmlVue from "@wooorm/starry-night/text.html.vue";
import textRobotsTxt from "@wooorm/starry-night/text.robots-txt";
import textZoneFile from "@wooorm/starry-night/text.zone_file";
import onigurumaWASMUrl from "vscode-oniguruma/release/onig.wasm?url";

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
