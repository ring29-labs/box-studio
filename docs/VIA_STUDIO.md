# VIA Aquaria Packaging Studio

The 3D designer is at `/designer/`. The existing workbook-driven form remains at `/`; both are built and deployed together. The native Mac app retains the offline guided form. This iteration adds the browser designer and SolidCraft files, not a new native CAD application.

## Three constructions and starting designs

| Construction | Studio starting look | Geometry and interaction | Price status |
| --- | --- | --- | --- |
| Lid & base | Nocturne: charcoal Wibalin, light interior, silver signature | Five-panel base, oversize lift-off lid, adjustable lid height and clearance | Connected 0302 workbook estimate for supported materials and treatments |
| Magnetic book | VIA Signature: burgundy Colorplan, ivory interior, gold signature | Tray, lower cover, spine, hinged upper cover and closing flap | Supplier quote required; no 0302 labour substitution |
| Shoulder & neck | Botanical: forest Colorplan, contrasting natural neck, gold signature | Base, four-panel neck and separate lid with neck clearance check | Supplier quote required |

The magnetic construction is the strongest presentation concept because the hinged opening makes the unboxing visible and expressive. The lid-and-base construction is the best starting point for a costed pilot because its labour model is already connected. These are design and implementation judgments, not claims about comparative manufacturing cost.

VIA product references:

- [Lid and base](https://via.lt/dezute-dugnelis-dangtelis/)
- [Magnetic box and its existing configurator](https://crm.via.lt/shop/magnetic-closure-box-3)
- [Shoulder / three-piece boxes](https://via.lt/triju-daliu-dezutes/)
- [VIA finishing and insert technology](https://via.lt/dezuciu-gamybos-technologijos/)

The VIA logo and product-reference thumbnails are copied from those public VIA pages at the user's request. UI typography follows the site's Montserrat, with white, charcoal and a red/burgundy accent. No VIA analytics or advertising scripts are copied.

## Engine choice

| Layer | Choice | Why |
| --- | --- | --- |
| Live preview | Three.js 0.187 / WebGL 2 | Fixed softboxes, separate colour, normal and roughness maps, laminate, metallic foil, shadows and lid animations |
| Shared geometry | `web/designer/model.js` | Millimetre panel dimensions, clearances and lid transforms used by preview, request packs and CAD export |
| Exact CAD export | Replicad 1.2.1 / OpenCascade WebAssembly | STEP assemblies generated on the visitor's device, with named board parts in millimetres |
| Costing | Existing Rust WebAssembly worker | Preserves the recovered material and labour formulas and existing integration rules |
| AI | Existing Vercel AI SDK / AI Gateway function | Stages geometry and visual changes for review; only supported lid-and-base configurations have a numeric estimate |
| Editable reference CAD | SolidCraft 0.44.1 through MCP | Parametric native `.sc` collection, STEP reference export and a reproducible MCP command recipe |

The approximately 22 MB CAD kernel loads only when STEP export is requested. It never runs on each slider movement. GLB export preserves the current visual pose and materials in metres. STEP exports a closed board assembly with CAD Z up; foil, ink and paper textures are visual treatments, not solid geometry. The SVG export is a board-panel concept layout, not a production die or wrapping dieline.

OpenCascade's generated JavaScript bindings use dynamic function generation. Only `/designer/cad-worker.js` receives a CSP allowing `unsafe-eval`; the parent application retains its existing CSP. That worker accepts validated numeric/configuration data, loads code and WASM only from the same origin, and does not execute user-supplied code. Replacing the kernel with a build using CSP-compatible embind dispatch would remove that exception.

Official engine references: [Three.js](https://threejs.org/docs/pages/WebGLRenderer), [GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html), [Replicad](https://replicad.xyz/), [OpenCascade.js](https://github.com/donalffons/opencascade.js).

### Studio rendering and artifacts

The interactive viewer uses Three.js physical materials and prefiltered HDR lighting. Rotate box and Turntable move the product in studio coordinates. The key light and the reflection map stay fixed. Orbit moves the camera, which naturally changes the viewing angle and reflected highlight. The Studio, Daylight and Gallery buttons select distinct fixed light rigs.

Seven reusable texture sets produce 21 PNG assets. The five paper profiles share fine-paper maps with the lining where appropriate. Each map set has neutral colour variation, tangent-space normals and glTF-compatible roughness. Tiles are scaled in millimetres so resizing a box does not stretch the grain. Gloss and soft-touch use a separate coating layer, and foil has a metallic response. The surface controls change the visual preview. Quote costing follows the specified paper and finish from the workbook.

The maps are procedurally generated preview assets. Physical samples or supplier texture scans, measured gloss, and colour targets are needed for material approval. To integrate measured assets later, version the map paths and replace the corresponding preview profile with a sourced profile.

| Engine | Fit for this workflow |
| --- | --- |
| [Three.js PBR](https://threejs.org/docs/pages/MeshPhysicalMaterial.html) and [PMREM](https://threejs.org/docs/pages/PMREMGenerator.html) | Chosen for the interactive designer. Separate coating parameters and filtered studio reflection maps cover the current requirement while preserving the viewer and GLB pipeline. |
| [Babylon.js PBR](https://doc.babylonjs.com/features/featuresDeepDive/materials/using/introToPBR) or [Filament](https://github.com/google/filament) | Both support physically based studio materials. Switching would require porting interactions, exports and tests while keeping the same need for good maps and lighting. |
| [three-gpu-pathtracer](https://gkjohnson.github.io/tools/docs/three-gpu-pathtracer/) or [Blender Cycles](https://www.blender.org/features/rendering/) | Candidates for a separate proof-render quality tier with light bounces and higher rendering cost. A worker or GPU render service would consume the render specification and produce approved stills. |

GET `/api/render-spec` returns the versioned material and artifact catalogue, including URLs for the built texture maps. POST accepts a JSON object with `configuration` and optional `camera` (`position`, `target`, `fov`) and `hasArtwork`. It returns validated geometry, material settings, lighting and pose. Coordinates for camera and light positions are in metres, while board dimensions are in millimetres. The render specification is exported from the designer and embedded in GLB metadata and quote-request packs. Custom logo pixels are included only in the local design, rendered output and relevant browser exports.

The browser produces PNG views, textured GLB, STEP and board-panel SVG. The backend resolves the JSON specification. The static catalogue supplies the texture maps. This integration is stateless and does not store uploads or run queued rendering jobs.

## ArtCraft and other tooling

The launcher inventory inspected for this work lists SolidCraft 0.44.1, CADCraft 0.20.1, FigCraft 0.18.1, PhotoCraft 0.23.1, FilmCraft 0.20.1, GridCraft 0.19.1, PdfCraft 0.21.1 and Craft Anything 0.6.1. Installed state can change; this is an implementation-time inventory. The screenshot showed a SolidCraft 0.45.0 update available; this work did not require installing it.

SolidCraft MCP built the reference CAD collection. GridCraft remains the spreadsheet inspection tool. CADCraft is useful for reviewing 2D board/drawing work, FigCraft for the interface, PhotoCraft for preparing customer artwork and FilmCraft for editing a walkthrough. The last four are available tools, not integrations claimed by this website. No CAD application needs to be installed on a customer's computer to use the web designer.

`cad/via-packaging-collection.sc` contains three default designs with 33 named board parts. `cad/solidcraft-build.json` records the MCP commands. Shared parameters are L, W, H, T, C, LH, Neck and Lift. Lift is an exploded reference position, not a simulated magnetic hinge. A test change of L from 240 to 300 mm rebuilt all 33 parts without errors and restored them on returning to 240 mm. CAD's default material density is not a validated paperboard density and must not be used to quote weight or freight.

## Customer workflow

Visitors can choose a construction or starting look, change dimensions, choose a source paper, visual colours and surface, add text/foil or a PNG/JPEG logo, inspect the interior, and export an image, GLB, STEP, panel SVG or saved design JSON. Each starting design has a stable link: `?design=signature`, `?design=nocturne` and `?design=botanical`. Share design creates a named, compressed snapshot URL with a content identifier. The complete settings travel in the URL fragment; no design database is needed. Uploaded artwork is excluded from links and can be shared with the saved design file. Logo images are normalized to PNG locally and are not sent to the assistant.

Up to five designs can be collected into a quote request. The visitor enters contact details and downloads a JSON request pack with geometry, settings, previews and any supported estimate. A readable brief and an email-draft link to VIA are provided. The visitor reviews and sends that email themselves. The demo does not submit into Odoo, charge a card, reserve production or create an accepted manufacturing order. There is no customer/contact database; contact fields are held in the current page and exported only at the visitor's choice.

Production integration should map an approved request schema to VIA's CRM quotation API, attach artwork and the geometry, return the actual CRM reference, and handle supplier approval, tax, delivery and agreed terms. These require the CRM account/API integration and commercial rules. The older product page's zero price and cart errors are not treated as order authority.

## Engineering boundaries and checks

The designer's size range is a concept envelope, not a promise that every combination is manufacturable. Board panels omit paper, glue, grain, kerf, corner joints and production tolerances. Screen colours are not supplier shade references. Foam is a frame concept, not a validated fitment for a real product. Source boards of 2.4 mm and custom artwork/ink treatments require supplier pricing; they cannot silently inherit a 2 mm or foil estimate. Foil is estimated using the artwork's rectangular bounds rather than actual ink coverage.

Run `npm test` for the existing Rust/native/WASM/assistant checks and `npm run test:designer` for geometry, fit, pricing boundaries, input validation and OpenCascade STEP assembly checks. Run `npm run build` to bundle the designer and copy the replaceable WASM library. Browser QA must cover all three constructions, opening, resizing, paper changes, image/GLB/STEP downloads, design import, request preparation, mobile layout and the deployed assistant. The existing workbook fidelity checks do not validate current supplier prices or actual workshop times.
