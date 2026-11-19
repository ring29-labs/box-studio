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
rm -f 'dist/Box Studio.app/Contents/Resources/forms.json'
swiftc -O -parse-as-library native/BoxStudio.swift target/release/libbox_studio_engine.a -framework AppKit -framework SwiftUI -o 'dist/Box Studio.app/Contents/MacOS/BoxStudio'
# An explicit archive prevents the linker from preferring the adjacent dylib.
if otool -L 'dist/Box Studio.app/Contents/MacOS/BoxStudio' | rg -q 'libbox_studio_engine|/target/'; then
 print -u2 'The Mac app must not depend on a library in the build checkout.'
 exit 1
fi
python3 -c 'import plistlib; from pathlib import Path; p=Path("dist/Box Studio.app/Contents/Info.plist"); p.write_bytes(plistlib.dumps({"CFBundleExecutable":"BoxStudio","CFBundleIdentifier":"local.saulius.box-studio","CFBundleName":"Box Studio","CFBundlePackageType":"APPL","CFBundleShortVersionString":"0.2.0","LSMinimumSystemVersion":"14.0","NSHighResolutionCapable":True}))'
codesign --force --sign - 'dist/Box Studio.app'
