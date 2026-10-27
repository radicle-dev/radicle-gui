# Radicle Explorer

This user interface lets you interact with [Radicle][rad], a peer-to-peer code
collaboration and publishing stack, directly from your web browser.

It lives in the `explorer/` folder of the radicle-gui repository, next to the
[Radicle desktop app](../desktop/README.md). Install dependencies at the
repository root, and run all other commands below from `explorer/`.

**Deployment Options:**

- **Public Server:** The Radicle team maintains a public instance at
  [radicle.network][app]
- **Local-first:** Run the UI locally
- **Self-hosting:** Deploy the UI on your own server

## Local-first

**Prerequisites:**

- Recent versions of [Node.js][nod] (24 or higher) and [npm][npm] installed

Run the following commands to access the web UI locally:

```shell
git clone https://seed.radicle.dev/z4V1sjrXqjvFdnCUbxPFqd5p4DtH5.git radicle-gui
cd radicle-gui
npm ci -w explorer
cd explorer
npm start
```

Then open http://localhost:3000 in your favourite browser.

## Self-Hosting the UI

There are several ways to deploy the UI publicly. Here are two common options:

**Using your own web server:**

1. Run `npm ci -w explorer` at the repository root, then `npm run build` in
   `explorer/` to create a build for deployment
2. Configure your web server to serve the contents of the `/build` directory

**Using Vercel (or similar static file hosting):**

1. Fork this repository to create your own version
2. Configure your Vercel account to deploy the forked repository

**Add Rewrite Rules for Client-Side Routing**

The explorer is a single-page application (SPA). To ensure that all routes are
handled correctly, add a [try_files rule](try) to your web server configuration.
For example:

Caddy:

```
example.com {
    root * /path/to/radicle-gui/explorer/build
    try_files {path} /index.html
    file_server
}
```

## Configuration

There are two ways to configure the UI: **at build time** and **at run time**.

### Build-Time Configuration

This method is recommended when deploying to static hosting platforms such as
Vercel.

#### Option 1: Create a `local.json` file

1. Copy [`default.json`][def] to a new file in the same directory called
   `local.json`.
2. Modify the properties in `local.json` to suit your setup.

#### Option 2: Use environment variables

1. Refer to [`custom-environment-variables.json`][env] for a list of supported
   environment variables.
2. Set the desired variables in your environment before building the UI.

> For advanced configuration options, refer to the [`node-config`][nco]
> documentation.

### Run-Time Configuration

This method is useful when the app is distributed as a precompiled static
JS/HTML bundle, such as when installed via a package manager.

You can build the app in a mode that loads configuration dynamically from the
server it's deployed to, instead of bundling it at build time.

To enable this behavior, set the environment variable `VITE_RUNTIME_CONFIG=true`
during the build:

```bash
VITE_RUNTIME_CONFIG=true npm run build
```

This will inject a blocking script into the `index.html` that attempts to load
the configuration from a pre-defined location (`/config.json`) on the server.

The config file must be served as static content and must be publicly
accessible. The structure of the runtime `config.json` must match the shape of
the application's base configuration defined in `config/default.json`.

### Homepage

The `nodes.homepage` key controls what is rendered at the root URL (`/`):

- `"node"` (default) — show the node view of the user's primary seed directly,
  as if the user had navigated to `/nodes/<your-node>`. The primary seed is
  resolved from `preferredSeeds` (see [`default.json`][def]). This is the
  default so that a self-hosted deployment acts as a dedicated front-end for its
  own seed.
- `"landing"` — serve the full Radicle marketing site: the landing page and its
  `/learn`, `/install` and documentation (`/glossary`, `/guides/*`) sub-routes.
  This is opt-in and intended for the canonical [radicle.network][app]
  deployment; the marketing sub-routes are only reachable in this mode.

The cross-seed Explore page is always available at `/explore`, regardless of the
`homepage` setting.

#### radicle.network deployment

`default.json` keeps `homepage` set to `"node"`, so self-hosted deployments are
unaffected. The canonical radicle.network deployment opts into the marketing
site at **build time** without changing that default. To deploy radicle.network,
run `npm run deploy`.

#### Node-homepage deployment

If you operate your own seed node and want the explorer to act as a dedicated
front-end for it (the default behaviour), put your own node first (and ideally
as the only entry) in `preferredSeeds` so it is always picked as the primary
seed.

Example `local.json`:

```json
{
  "preferredSeeds": [
    {
      "hostname": "seed.example.com",
      "port": 443,
      "scheme": "https"
    }
  ]
}
```

With this configuration, opening `/` lands the visitor on the node view for
`seed.example.com`. Keeping `preferredSeeds` to a single entry ensures the
primary seed is deterministic; if you list multiple, users are bucketed across
them and may land on a different node.

## Repository aliases

`radicle-httpd` can map a short, human-readable alias to a repository ID (RID),
so a repository can be referred to by name instead of its full `rad:`
identifier. Aliases are configured on the node with the `--alias <name> <rid>`
flag, which may be repeated:

```sh
radicle-httpd --alias heartwood rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5
```

An alias works anywhere the RID is accepted: `git clone`, the HTTP API, the raw
endpoints, and Explorer URLs — the router resolves it transparently. With the
alias above, these two Explorer URLs point at the same repository:

```
https://radicle.network/nodes/seed.example.com/rad:z3gqcJUoA1n9HaHKufZs5FCSGazv5/issues
https://radicle.network/nodes/seed.example.com/heartwood/issues
```

and the repository can be cloned over Git by its alias:

```sh
git clone https://seed.example.com/heartwood.git
```

## Development

Run `npm run check` before proposing a patch, along with the test suites:
`npm run test:unit`, `npm run test:http-client:unit` and `npm run test:e2e`.

E2E tests build the app and create fixtures before running. If neither the
source nor the fixtures changed since the last run, skip that with
`SKIP_SETUP=true`:

```sh
npm run test:e2e -- --project chromium
SKIP_SETUP=true npm run test:e2e -- tests/e2e/repo/commits.spec.ts:90 --project chromium
```

When changing `radicle-httpd`, `npm run test:e2e:local` compiles it from
`crates/radicle-httpd/` and runs the suite against that build instead of the
released binary.

If Playwright's browsers don't support your OS, `scripts/test-e2e-docker` runs
the suite in a container (Docker with the Compose plugin). It forwards its
arguments and `SKIP_SETUP` to `npm run test:e2e`, and `--local` tests against
httpd built from source. The first run downloads Chromium and is slow.

## Contributing

See [CONTRIBUTING.md][con] for how to propose changes and write commit messages.
Open an [issue][iss] or a [patch][pat] using Radicle.

## Getting in touch

To get in touch with the maintainers, sign up to our [official chat on
Zulip][zul].

## License

The UI is distributed under the terms of GPLv3. See [LICENSE][lic] for details.

[app]: https://radicle.network
[con]: ../CONTRIBUTING.md
[def]: ./config/default.json
[env]: ./config/custom-environment-variables.json
[iss]:
  https://radicle.network/nodes/iris.radicle.network/rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5/issues
[lic]: ./LICENSE
[nco]: https://github.com/node-config/node-config/wiki/Configuration-Files
[nod]: https://nodejs.org
[npm]: https://www.npmjs.com
[pat]:
  https://radicle.network/nodes/iris.radicle.network/rad:z4V1sjrXqjvFdnCUbxPFqd5p4DtH5/patches
[rad]: https://radicle.dev
[try]: https://caddyserver.com/docs/caddyfile/patterns#single-page-apps-spas
[zul]: https://radicle.zulipchat.com/#narrow/stream/369278-web
