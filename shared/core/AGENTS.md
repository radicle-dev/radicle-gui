# @radicle-gui/core

Domain logic shared by explorer, desktop and `@radicle-gui/ui`, as plain
TypeScript: types and pure functions, such as the query keys in
`src/keys.ts` and the keys a ref update affects in `src/refUpdates.ts`. See
`docs/adr/0004-shared-core.md` and `docs/adr/0005-reactivity.md` at the
repository root.

The package lives in `shared/core/` of the radicle-gui monorepo, in the root
npm workspace: install dependencies at the repository root with `npm ci`, and
run every other command here from `shared/core/`. Conventions shared with
both apps are in the root `AGENTS.md`.

## Rules

- No Svelte, DOM, Tauri or network dependencies, and no imports from either
  app or from `@radicle-gui/ui`. The tsconfig leaves out DOM and Node types,
  and eslint rejects the imports
- `@radicle-gui/ui` and the apps depend on core, never the other way round
- The apps import it as `@radicle-gui/core/<module>`

## Checks and tests

```sh
npm run check           # tsc, eslint, prettier
npm run format          # auto-fix prettier and eslint issues
npm run test:unit
```

CI runs these in `.github/workflows/shared-core.yml`. A change here affects
`shared/ui` and both apps, so also run their checks.
