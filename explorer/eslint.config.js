import globals from "globals";
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import svelte from "eslint-plugin-svelte";
import svelteParser from "svelte-eslint-parser";
import ts from "typescript-eslint";

export default [
  ...[
    js.configs.recommended,
    ...ts.configs.recommended,
    prettier,
    {
      languageOptions: {
        parser: ts.parser,
        parserOptions: {
          project: "./tsconfig.json",
          tsconfigRootDir: import.meta.dirname,
          extraFileExtensions: [".svelte"],
        },
        globals: { ...globals.browser, ...globals.node },
      },
      rules: {
        "no-implicit-globals": "error",
        "no-restricted-globals": [
          "error",
          "name",
          "event",
          "frames",
          "history",
          "length",
          "content",
          "origin",
          "status",
        ],
        // Require using arrow functions as callbacks.
        // https://eslint.org/docs/rules/prefer-arrow-callback
        "prefer-arrow-callback": "warn",
        // Require using const for variables that are never modified after declared.
        // https://eslint.org/docs/rules/prefer-const
        "prefer-const": "warn",
        // Disallow modifying variables that are declared using const.
        // https://eslint.org/docs/rules/no-const-assign
        "no-const-assign": "error",
        // Require let or const instead of var.
        // https://eslint.org/docs/rules/no-var
        "no-var": "warn",
        // Require `===` and `!==` comparisons.
        eqeqeq: "warn",
        "@typescript-eslint/no-floating-promises": "warn",
        "@typescript-eslint/no-empty-function": "warn",
        "@typescript-eslint/naming-convention": [
          "warn",
          {
            selector: "enumMember",
            format: ["PascalCase"],
          },
          {
            selector: "objectLiteralProperty",
            format: ["PascalCase", "camelCase"],
          },
          {
            selector: "default",
            format: ["camelCase"],
            leadingUnderscore: "allow",
            trailingUnderscore: "allow",
          },
          {
            selector: "variable",
            modifiers: ["const"],
            format: ["camelCase", "PascalCase", "UPPER_CASE"],
            leadingUnderscore: "allow",
            trailingUnderscore: "allow",
          },
          {
            selector: "typeLike",
            format: ["PascalCase"],
          },
          // Disable @typescript-eslint/naming-convention format for imports
          // https://github.com/typescript-eslint/typescript-eslint/pull/7269#issuecomment-1777628591
          // https://github.com/typescript-eslint/typescript-eslint/issues/7892
          { selector: "import", format: null },
          {
            selector: ["objectLiteralProperty"],
            modifiers: ["requiresQuotes"],
            format: null,
          },
        ],
        "@typescript-eslint/no-namespace": [
          "error",
          { allowDeclarations: true },
        ],
        "@typescript-eslint/member-ordering": [
          "warn",
          { default: ["field", "signature", "constructor", "method"] },
        ],
        // Allow explicit type annotations for additional clarity.
        "@typescript-eslint/no-inferrable-types": "off",
        "@typescript-eslint/no-invalid-void-type": ["warn"],
        // Disallow Unused Variables.
        // https://eslint.org/docs/rules/no-unused-vars
        "@typescript-eslint/no-unused-vars": [
          "warn",
          { argsIgnorePattern: "^_" },
        ],
      },
    },
  ].map(conf => ({
    ...conf,
    linterOptions: {
      reportUnusedDisableDirectives: "error",
    },
    files: ["**/*.js", "**/*.ts", "**/*.svelte"],
    ignores: ["workers/**/*"],
  })),
  ...svelte.configs["flat/recommended"],
  ...svelte.configs["flat/prettier"],
  {
    files: ["*.svelte", "**/*.svelte"],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: ts.parser,
        project: "./tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
        svelteFeatures: {
          experimentalGenerics: true,
        },
      },
    },
    rules: {
      "svelte/no-at-html-tags": "off",
      "svelte/require-each-key": "off",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  // Workers: basic JS linting without TypeScript type-checking.
  {
    files: ["workers/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      "prefer-arrow-callback": "warn",
      "prefer-const": "warn",
      "no-const-assign": "error",
      "no-var": "warn",
      eqeqeq: "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-shadow": "warn",
      "no-throw-literal": "error",
      "no-implicit-coercion": "warn",
      "no-param-reassign": "warn",
      "no-return-assign": "error",
      "no-sequences": "error",
      "no-template-curly-in-string": "warn",
      "prefer-template": "warn",
    },
  },
  {
    ignores: [
      "node_modules/**/*",
      ".npm-cache/**/*",
      "build/**/*",
      "public/**/*",
      "radicle-httpd/**/*",
      "radicle-search/**/*",
      "target/**/*",
      "target-docker/**/*",
      "workers/**/node_modules/**/*",
      "workers/**/.wrangler/**/*",
    ],
  },
];
