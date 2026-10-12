# Radicle Desktop

This desktop application lets you interact with [Radicle][rad], a peer-to-peer code collaboration and publishing stack.

## Installation

See [radicle.dev/desktop#install](https://radicle.dev/desktop#install).

### From source

**Prerequisites:**

- [Node.js][nod] (24 or higher) and [npm][npm]
- [Rust][rus] toolchain (1.77 or higher)
- [Tauri system dependencies][tau]

On Windows, NPM's script shell must be set to a POSIX compatible shell such as
[Git Bash][gfw]:

```
npm config set script-shell "C:\\Program Files\\git\\bin\\bash.exe"
```

Run the following commands to build the desktop app locally:

```
git clone https://seed.radicle.dev/z4D5UCArafTzTQpDZNQRuqswh3ury.git radicle-desktop
cd radicle-desktop
npm install
npm run tauri build
```

Then run one of the builds that the script outputs at the end.

## Development

To start the app in development mode with hot reload:

```
npm run dev
```

To log how long every backend command takes, for performance work, set
`VITE_LOG_INVOKE_TIMINGS=true`. Each call then prints `[invoke] <command> <ms>ms`
to the browser console (visible at debug level):

```
VITE_LOG_INVOKE_TIMINGS=true npm run dev
```

A dev build uses its own identifier, so it runs next to an installed release,
and it never registers itself as the handler for `rad:` links. On Linux and
Windows, open a link in it by starting the dev binary a second time with the
link as its argument, while `npm run dev` is running:

```
target/dev-without-assertions/radicle-desktop rad:z4D5UCArafTzTQpDZNQRuqswh3ury
```

On macOS links only reach app bundles. Quit the installed app, then build and
open a debug bundle:

```
npm run tauri build -- --debug --bundles app
```

## Releasing

Releases are driven by an interactive, phased script. Start one with:

```
scripts/release --phase prep --version X.Y.Z
```

Each phase does its mechanical work, then prints the manual tasks for its gate
and the exact flag to resume with. List the phases and see the configuration
with `scripts/release --list` and `scripts/release --help`.

## Getting in touch

To get in touch with the maintainers, sign up to our [official chat on Zulip][zul].

## License

The UI is distributed under the terms of GPLv3. See [LICENSE][lic] for details.

[gfw]: https://gitforwindows.org
[lic]: ./LICENSE
[rad]: https://radicle.dev
[nod]: https://nodejs.org
[npm]: https://www.npmjs.com
[rus]: https://www.rust-lang.org/
[tau]: https://v2.tauri.app/start/prerequisites/#system-dependencies
[zul]: https://radicle.zulipchat.com/#narrow/stream/444463-desktop
