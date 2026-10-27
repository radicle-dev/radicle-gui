# radicle-gui

Graphical interfaces for [Radicle][rad], a peer-to-peer code collaboration and
publishing stack.

* [`explorer/`](explorer/README.md): the web explorer, deployed at
  [radicle.network][app], with the `radicle-httpd` and `radicle-search`
  backends it talks to.
* [`desktop/`](desktop/README.md): the desktop app.
* [`shared/ui/`](shared/ui/AGENTS.md): UI components, design tokens and fonts
  used by both.

One npm workspace at the root holds all three: install the dependencies there,
with `npm ci -w explorer` or `npm ci -w desktop` for a single app. Each app is
built, tested and released on its own; see its README. The
guidelines for contributing to either are in [CONTRIBUTING.md](CONTRIBUTING.md),
and decisions that affect the whole repository are in [`docs/adr/`](docs/adr/).

[app]: https://radicle.network
[rad]: https://radicle.dev
