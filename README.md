# Box Studio

[VIA 3D Packaging Studio](https://box-studio.ring29.com/designer/) adds three constructions, live materials and artwork, animated opening, client-side STEP/GLB export and a quote-request pack. Read [the designer and tool notes](docs/VIA_STUDIO.md) for architecture, CAD models and production-integration boundaries.

A guided configurator for a 0302 rigid box with a separate lid and base. Dimensions, material selections and finishing drive production labour and the quote automatically. It runs in a browser and as a local Mac app.

The browser uses WebAssembly compiled from the same Rust engine linked into the Mac app. Ordinary form calculations happen on the user's device. The website also offers an optional assistant built with Vercel AI SDK 7 and AI Gateway; it proposes changes using that same Rust calculator. The offline Mac form does not require an account, database or model API.

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

Node.js 22 and Python 3 are sufficient for the checked-in browser build:

```sh
npm ci
npm run build
npm run preview
```

Open `http://127.0.0.1:4178`. The build checks hashes of the Rust source, source workbook data and WebAssembly binary to prevent publishing a stale calculation engine.

The static preview supports the form. To test the server assistant locally, run `npm ci`, configure `AI_GATEWAY_API_KEY` in a private local environment file, and use `vercel dev`. Never commit the key or put it in a `VITE_`, `NEXT_PUBLIC_` or other frontend variable.

## AI configuration assistant and skill

Open **Configure with the AI assistant** below the current form. Describe dimensions, quantity or finishing, or ask it to explain the quote. The assistant can look up exact catalogue values and propose a configuration. Its tool calls run the checked-in Rust WebAssembly engine on the server. A proposal displays the calculated price and changed settings; **Apply to form** updates the local form. If the form changes after the request, the proposal cannot be applied until refreshed.

The default model is `openai/gpt-4.1-mini` through Vercel AI Gateway. A server-only `BOX_ASSISTANT_MODEL` environment variable can select another compatible tool-capable model. `AI_GATEWAY_API_KEY` is a sensitive Vercel production secret. The dedicated demo key was created with a $5 lifetime quota and 90-day expiry; it needs replacement or renewal when exhausted or expired. This is a usage cap, not a prepayment or recurring purchase. The endpoint deliberately requires that key instead of falling back to unbudgeted project OIDC access.

Requests are bounded to four model steps, 1,000 output tokens per step, a 45-second model timeout and at most six prior chat messages. Same-origin checks and a per-instance IP limiter reduce casual abuse; the latter is not a distributed global rate limit. The Gateway key quota is the spend boundary. AI prose remains advisory; calculated preview prices are authoritative for the source model.

When a visitor asks the assistant, current box settings and recent chat are sent to our Vercel function and model provider through Gateway. The app has no chat database. Provider and hosting retention policies still apply. Names and preview colours are not included in configuration requests. Regular form edits, JSON saves and CSV exports remain local.

`skills/box-studio/SKILL.md` is the reusable Codex skill and the server's shared domain instruction source. Install by copying the `box-studio` folder into `~/.codex/skills/`. It contains the engine interface, cost rules, catalogue boundaries and review workflow. The original GridCraft skill and MCP bridge are separate spreadsheet tooling.

## Recorded walkthrough

Open [the walkthrough](https://box-studio.ring29.com/demo.html) for a 65-second recording of the native Mac form, with English captions. It demonstrates dimensions, input validation, materials, foil stamping, hourly cost and quantity comparison. The website's AI assistant was added after that recording.

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

The public repository is `ring29-labs/box-studio`. The Vercel project is `ring29-box-studio`, with `box-studio.ring29.com` as its custom domain. `vercel.json` defines the static build, the assistant function and browser security headers. Set the sensitive `AI_GATEWAY_API_KEY` production environment variable before deploying. Only explicit assistant requests send configuration values to the server; the form otherwise calculates locally.
