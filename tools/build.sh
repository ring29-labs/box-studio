#!/bin/zsh
set -eu
cd "$(dirname "$0")/.."
node tools/build-web.mjs
cargo build --offline --release --lib
mkdir -p 'dist/Box Studio.app/Contents/MacOS' 'dist/Box Studio.app/Contents/Resources'
mkdir -p 'dist/Box Studio.app/Contents/Resources/site'
for name in index.html style.css app.js catalog.js icon.svg; do
 cp "web/dist/$name" "dist/Box Studio.app/Contents/Resources/site/$name"
done
swiftc -O -parse-as-library native/BoxStudio.swift -L target/release -lbox_studio_engine -framework AppKit -framework SwiftUI -o 'dist/Box Studio.app/Contents/MacOS/BoxStudio'
python3 -c 'import plistlib; from pathlib import Path; p=Path("dist/Box Studio.app/Contents/Info.plist"); p.write_bytes(plistlib.dumps({"CFBundleExecutable":"BoxStudio","CFBundleIdentifier":"local.saulius.box-studio","CFBundleName":"Box Studio","CFBundlePackageType":"APPL","CFBundleShortVersionString":"0.2.0","LSMinimumSystemVersion":"14.0","NSHighResolutionCapable":True}))'
codesign --force --sign - 'dist/Box Studio.app'
