{
  lib,
  importNpmLock,
  rust-bin,
  makeRustPlatform,
  cargo-tauri,
  nodejs,
  pkg-config,
  wrapGAppsHook4,
  glib,
  gtk3,
  libsoup_3,
  openssl,
  webkitgtk_4_1,
  git,
  openssh,
  system,
  playwright-driver,
  heartwood,
  twemoji-assets,
  radicle-node,
  GIT_HEAD ? null,
}:
let
  rTc = rust-bin.fromRustupToolchainFile ./../rust-toolchain.toml;
  rustPlatform = makeRustPlatform {
    cargo = rTc;
    rustc = rTc;
  };
in
rustPlatform.buildRustPackage rec {
  pname = "radicle-desktop";
  inherit (with builtins; (fromJSON (readFile ./../package.json))) version;

  src = ./..;

  cargoDeps = rustPlatform.importCargoLock {
    lockFile = ./../Cargo.lock;
    outputHashes = {
      "radicle-job-0.6.0" = "sha256-sdi3kksARVTFenqQq4dsgg499zwYk4V7tN4shg07aX8=";
    };
  };

  npmDeps = importNpmLock {
    inherit version;
    pname = pname + "-npm-deps";
    npmRoot = ./..;
  };

  nativeBuildInputs = [
    cargo-tauri.hook
    nodejs
    importNpmLock.npmConfigHook
    pkg-config
    wrapGAppsHook4
  ];

  buildInputs = [
    glib
    gtk3
    libsoup_3
    openssl
    webkitgtk_4_1
  ];

  propagatedBuildInputs = [
    radicle-node
  ];

  postPatch = ''
    patchShebangs scripts/copy-katex-assets scripts/check-js scripts/check-rs
    mkdir -p public/twemoji
    cp -t public/twemoji -r -- ${twemoji-assets}/assets/svg/*
    : >scripts/install-twemoji-assets
  '';

  doCheck = false;
  nativeCheckInputs = [
    git
    openssh
  ];

  env =
    {
      HW_RELEASE = "nix-" + (heartwood.shortRev or "unknown-ref");
      PLAYWRIGHT_BROWSERS_PATH = playwright-driver.browsers;
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = 1;
      PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = true;
      RUST_SRC_PATH = "${rTc}/lib/rustlib/src/rust/library";
    }
    // (lib.optionalAttrs (GIT_HEAD != null) {
      inherit GIT_HEAD;
    });

  preCheck = ''
    export RAD_HOME="$PWD/_rad-home"
    export RAD_PASSPHRASE=""
    rad auth --alias test
    bins="tests/tmp/bin/heartwood/$HW_RELEASE"
    mkdir -p "$bins"
    cp -t "$bins" -- ${heartwood.packages.${system}.radicle}/bin/*
    printf "$HW_RELEASE" >tests/support/heartwood-release
  '';

  checkPhase = ''
    npm run build:http
    npm run test:unit
    scripts/check-js
    scripts/check-rs
  '';

  passthru.env = env;
  meta = {
    description = "Radicle Desktop App";
    license = lib.licenses.gpl3;
    maintainers = [ ];
  };
}
