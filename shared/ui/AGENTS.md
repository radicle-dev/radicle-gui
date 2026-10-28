# @radicle-gui/ui

UI code shared by explorer and desktop: Svelte components in `components/`,
TypeScript helpers in `lib/`, and the design tokens, stylesheets and fonts in
`public/`. Desktop is the source we extract shared code from.

The package lives in `shared/ui/` of the radicle-gui monorepo, in the root npm
workspace: install dependencies at the repository root with `npm ci`, and run
every other command here from `shared/ui/`. All paths in this file are
relative to it. Conventions shared with both apps are in the root `AGENTS.md`.

## Rules

- Don't import `@tauri-apps/*`, `@bindings`, `@http-client` or anything else
  from one app. Components take plain props, and each app adapts its own data
  to them
- Write components with current Svelte 5 APIs: runes, callback props and
  snippets. Explorer still uses legacy syntax and migrates to Svelte 5
  incrementally: when it adopts an extracted component, update the explorer
  components that use it to runes too, rather than shaping the shared
  component around legacy syntax
- Import within the package with relative paths. The apps import it as
  `@radicle-gui/ui/components/<Name>.svelte` and `@radicle-gui/ui/lib/<name>`
- Declare every package the shared code uses at runtime in `package.json`,
  with `svelte` as a peer dependency, and ask before adding one

## Component API

Shared components take data in and report changes out. They can offer rich
interactions such as editing, but the app owns all data and I/O.

- Props are plain data in types defined in `lib/types.ts`, never an app's
  types, stores or class instances
- Writes are callback props such as `onEdit?: (body: string) => Promise<void>`.
  When a callback is absent, the component leaves out that control, which is
  how explorer gets the read-only version
- Callbacks may return a promise: the component shows its own pending and
  error states while the app does the actual work
- Anything app-specific comes in as a snippet or a string, such as an `href` or
  a link snippet. Components never navigate on their own
- State that only the component cares about, such as whether a menu is open or
  an unsaved draft, may be internal or `$bindable`. Everything else is passed
  in, and never fetched, cached or persisted by the component
- No side effects: no `fetch`, `invoke`, `localStorage`, `location`, polling or
  app context. Context defined in this package, such as the theme, is fine
- Props can change at any time when newer data arrives. Keep local state such
  as drafts, scroll position, selection and expanded threads across such
  updates, and key lists by stable ids so items update instead of being
  recreated
- Style only with scoped CSS and the shared design tokens

ESLint enforces the import and global restrictions.

## Prop types

Both apps' types come from heartwood, through different serializations, and
should converge over time. Keep shared types small so that this doesn't churn
the components:

- Ask only for the fields a component uses: `UserAvatar` takes a `did`, not a
  whole author
- Name and shape shared types after heartwood's types, not either app's. Where
  the apps differ, such as explorer's author `id` and desktop's `did`, follow
  heartwood
- Define them in `lib/types.ts`, named after domain concepts such as `Author`
  or `Reaction`. The first extraction that needs a domain type creates the
  file
- Apps pass their own objects when the shapes match, and map them in one place
  where they don't. Never import an app's types here

## Stylesheets and fonts

The `sharedPublic()` Vite plugin in `vite.ts` serves `public/` at each app's
root URL in dev and adds it to their builds. The apps link the stylesheets in
`index.html` with `vite-ignore`, so Vite doesn't look for them in the app's
own `public/`. Don't add files at paths an app's own `public/` already uses.

## Checks and tests

```sh
npm run check           # svelte-check, eslint, prettier
npm run format          # auto-fix prettier and eslint issues
npm run test:unit
```

CI runs these in `.github/workflows/shared-ui.yml`. A change here affects both
apps, so also run explorer's `npm run check` and desktop's `npm run check-js`.
