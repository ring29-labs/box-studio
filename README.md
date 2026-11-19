# Box Studio

A guided configurator for a 0302 rigid box with a separate lid and base. Dimensions, material selections and finishing drive production labour and the quote automatically. It runs in a browser and as a local Mac app.

The browser uses WebAssembly compiled from the same Rust engine linked into the Mac app. Calculations happen on the user's device. No account, database or model API is required.

## Quote calculation

The five steps cover the box and quantity, materials and print, finishing, production and pricing, and the quote review. The estimate remains visible as the configuration changes.

- **Materials and outside services** use the recovered box workbook's variable-cost calculations.
- **Production labour** uses the automatic, semi-automatic or manual 0302 labour model. Inside lining, lamination, foil and relief selections enable the matching processes. Setup time and repeated relief passes are included.
- **Auto production** chooses automatic wrapping from 2,000 units when it fits, semi-automatic when that fits, and manual otherwise. An explicit machine choice must pass its fit check.
- **Delivery** optionally adds the source packaging and freight calculation.
- **Selling price** divides total cost by `1 − gross margin`, then rounds the unit price up to a cent.

The source selling price already contains a throughput allowance. The guided quote replaces that allowance with explicit labour and margin. It does not add labour to the old selling price, or charge the source finishing labour tariffs again.

The review includes quantity comparisons and the production-process breakdown with original cell references. Configurations can be saved as JSON and quotes exported as CSV.

## Run the web app

Node.js and Python 3 are sufficient for the checked-in browser build:

```sh
npm run build
npm run preview
```

Open `http://127.0.0.1:4178`. The build checks hashes of the Rust source, source workbook data and WebAssembly binary to prevent publishing a stale calculation engine.

## Rebuild the engine

With Rust and the WebAssembly target installed:

```sh
rustup target add wasm32-unknown-unknown
npm run build:engine
npm run build
npm test
```

On macOS, the build script also supports Homebrew Rust with its matching library sources and `wasm-ld`. This fallback uses `cargo -Z build-std` with `RUSTC_BOOTSTRAP=1`.

## Build the Mac app

On an Apple Silicon Mac with the Swift command-line tools and Rust:

```sh
zsh tools/build.sh
```

The result is `dist/Box Studio.app`, locally ad-hoc signed. WebKit displays the same guided form as the website; a native message bridge calls Rust directly and provides native configuration-file and export dialogs. It works without a server or network connection.

## Source and verification

The supplied workbook prices are intentionally included in this public demo. The original templates are `0302 Labour cost - 09-02-2026.ots` and `New Box formula 22-04-2026.ots`. Neither contains embedded macro modules or script event handlers. Their automation is expressed in 8,317 formulas.

The original engine matches all 6,702 saved numeric formula results and 434 saved text formula results. It also reproduces 1,181 source error results, including errors in unused branches. Thirteen Rust tests cover source regression, automatic labour linkage, quantity routing, finishing, rate changes and invalid inputs. Ten request cases compare native and WebAssembly results.

These checks establish fidelity to the supplied models and the new integration rules. They do not independently validate supplier tariffs or manufacturing assumptions. The source catalogue has not been refreshed. This demo provides estimates for review; it does not place orders or submit supplier quotes.

Only 0302 lid-and-base labour is connected in the guided workflow. The extracted source retains the other construction, insert and foam formulas for investigation, but the guided app does not apply 0302 labour to those other products.

| Path | Purpose |
| --- | --- |
| `src/lib.rs` | OpenDocument formula parser and recovered calculation engine |
| `src/guided.rs` | Automatic production mapping and connected quote calculation |
| `src/wasm.rs` | Browser WebAssembly memory interface |
| `web/` | Guided form, local worker, preview and checked-in browser engine |
| `native/BoxStudio.swift` | Mac window, Rust bridge and native file dialogs |
| `evidence/workbooks.json` | Extracted source formulas, values, validation lists and precision |
| `evidence/calculation-verification.json` | Full source regression results |
| `REVERSE_ENGINEERING.txt` | Source model details and boundaries |

The older Via configurator was inspected to understand its product options and preview. Its prices, cart and order flow are not used by this demo.

## Deployment

The public repository is `ring29-labs/box-studio`. The Vercel project is `ring29-box-studio`, with `box-studio.ring29.com` as its custom domain. `vercel.json` defines the static build and browser security headers. The server publishes assets; it does not receive configuration values for calculation.
