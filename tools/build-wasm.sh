#!/bin/zsh
set -eu
cd "$(dirname "$0")/.."
if command -v rustup >/dev/null && rustup target list --installed | rg -q '^wasm32-unknown-unknown$'; then
 cargo build --release --lib --target wasm32-unknown-unknown
else
 # Homebrew ships matching Rust library sources; build the target standard library.
 export CARGO_TARGET_WASM32_UNKNOWN_UNKNOWN_LINKER="$(command -v wasm-ld)"
 RUSTC_BOOTSTRAP=1 cargo build --release --lib --target wasm32-unknown-unknown -Z build-std=std,panic_abort
fi
cp target/wasm32-unknown-unknown/release/box_studio_engine.wasm web/engine.wasm
node tools/engine-manifest.mjs --write
