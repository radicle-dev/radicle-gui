{
  description = "Radicle Desktop App";
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    flake-utils.url = "github:numtide/flake-utils";
    crane.url = "github:ipetkov/crane";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    heartwood = {
      url = "git+https://seed.radicle.xyz/z3gqcJUoA1n9HaHKufZs5FCSGazv5?ref=refs/tags/releases/1.9.0";
    };
  };

  outputs = {
    self,
    crane,
    nixpkgs,
    flake-utils,
    rust-overlay,
    heartwood,
    ...
  }: (flake-utils.lib.eachDefaultSystem (system: let
    pkgs = import nixpkgs {
      inherit system;
      overlays = [
        (import rust-overlay)
      ];
    };

    lib = pkgs.lib;

    rustup = rec {
      toolchain = pkgs.rust-bin.fromRustupToolchainFile ./rust-toolchain.toml;
      craneLib = (crane.mkLib pkgs).overrideToolchain toolchain;
      commonArgs = mkCommonArgs craneLib;
    };

    rustupDevShell = rec {
      toolchain = rustup.toolchain.override (prev: {
        extensions = prev.extensions ++ ["rust-analyzer"];
      });
      craneLib = (crane.mkLib pkgs).overrideToolchain toolchain;
      commonArgs = mkCommonArgs craneLib;
    };

    basicArgs = {
      src = pkgs;
      pname = "Radicle Desktop";
      strictDeps = true;
    };

    # Common arguments can be set here to avoid repeating them later
    mkCommonArgs = craneLib:
      basicArgs
      // {
        cargoArtifacts = craneLib.buildDepsOnly basicArgs;

        buildInputs = lib.optionals pkgs.stdenv.buildPlatform.isDarwin (with pkgs; [
          darwin.apple_sdk.frameworks.Security
        ]);
      };
  in {
    checks = {
      radicle-desktop = self.packages.${system}.radicle-desktop.overrideAttrs {doCheck = true;};
    };

    devShells.default = rustupDevShell.craneLib.devShell {
      name = "radicle-desktop-env";
      inputsFrom = [self.checks.${system}.radicle-desktop];
      nativeBuildInputs = with pkgs; [
        cargo-watch
        cargo-nextest
        ripgrep
        rust-analyzer
      ];
      env =
        self.checks.${system}.radicle-desktop.env
        // {
        };
    };

    packages = {
      default = self.packages.${system}.radicle-desktop;
      twemoji-assets = pkgs.fetchFromGitHub {
        owner = "twitter";
        repo = "twemoji";
        rev = "v14.0.2";
        hash = "sha256-YoOnZ5uVukzi/6bLi22Y8U5TpplPzB7ji42l+/ys5xI=";
      };

      radicle-desktop =
        pkgs.callPackage ./nix/radicle-desktop.nix {
          inherit heartwood;
          inherit (self.packages.${system}) twemoji-assets;
        }
        // (
          if self ? rev || self ? dirtyRev
          then {
            GIT_HEAD =
              if self ? rev
              then self.rev
              else self.dirtyRev;
          }
          else {}
        );
    };
  }));
}
