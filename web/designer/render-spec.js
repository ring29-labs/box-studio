export const renderVersion = 'via-studio-render/1';
export const assetRoot = '/designer/assets/render/v1/';

// Preview profiles. Tile size is in millimetres. The presets are art-directed
// approximations until VIA supplies physical swatches and measured values.
export const surfaceProfiles = {
  colorplan: { texture: 'fine-paper', tileMm: 35, roughness: .92, grain: .45, sheen: .16 },
  wibalin: { texture: 'buckram', tileMm: 35, roughness: .94, grain: .85, sheen: .33 },
  coated: { texture: 'coated', tileMm: 40, roughness: .66, grain: .2, sheen: 0 },
  kraft: { texture: 'kraft', tileMm: 42, roughness: 1, grain: .65, sheen: .02 },
  geltex: { texture: 'fine-weave', tileMm: 33, roughness: .87, grain: .64, sheen: .21 },
  lining: { texture: 'fine-paper', tileMm: 35, roughness: .96, grain: .35, sheen: .08 },
  foam: { texture: 'foam', tileMm: 25, roughness: 1, grain: .72, sheen: 0 },
  foil: { texture: 'foil', tileMm: 30, roughness: .25, grain: .24, sheen: 0 },
};

// Both the reflection cards and the shadow light use studio coordinates.
// Only a preset change can reposition them.
export const lightProfiles = {
  studio: {
    background: '#e9e8e5', exposure: 1, ambient: '#777875', environment: .92,
    key: [1.05, 1.55, 1.45], keyColor: '#fff3e5', shadow: .95,
    cards: [
      { position: [1.05, 1.55, 1.45], size: [1.65, 1.08], colour: '#fff5e9', radiance: 7 },
      { position: [-1.45, .9, .5], size: [.56, 1.56], colour: '#e3eafa', radiance: 4.2 },
      { position: [-1.1, .89, -1.35], size: [1.55, .47], colour: '#fffdf5', radiance: 7 },
    ],
  },
  daylight: {
    background: '#e6ecee', exposure: 1.04, ambient: '#9ca6af', environment: .88,
    key: [-1.55, 1.4, .85], keyColor: '#eaf3ff', shadow: .8,
    cards: [
      { position: [-1.55, 1.4, .85], size: [1.65, 1.5], colour: '#e8f3ff', radiance: 6 },
      { position: [.65, 1.7, .15], size: [1.15, .8], colour: '#fff9ed', radiance: 3.2 },
    ],
  },
  night: {
    background: '#252428', exposure: 1, ambient: '#454047', environment: 1,
    key: [1.5, 1.1, .7], keyColor: '#fff0e3', shadow: 1.1,
    cards: [
      { position: [1.5, 1.1, .7], size: [.55, 1.32], colour: '#fff1de', radiance: 10 },
      { position: [-1.12, .89, -1.5], size: [.58, 1.32], colour: '#c9d6ff', radiance: 8 },
      { position: [-1, .46, 1.3], size: [.65, .55], colour: '#fff6ef', radiance: 2.2 },
    ],
  },
};

export const renderArtifacts = [
  { id: 'image', format: 'PNG', stage: 'browser', description: 'Current studio view' },
  { id: 'model', format: 'GLB', stage: 'browser', description: '3D model with paper, foil and coating materials' },
  { id: 'cad', format: 'STEP', stage: 'browser', description: 'Closed board geometry, millimetres' },
  { id: 'panels', format: 'SVG', stage: 'browser', description: 'Concept board panel layout' },
  { id: 'recipe', format: 'JSON', stage: 'backend', description: 'Versioned material, lighting and geometry settings' },
  { id: 'texture', format: 'PNG', stage: 'static', description: 'Colour variation, normal and roughness maps' },
];

function mapPaths(texture) {
  return Object.fromEntries(['colour', 'normal', 'roughness'].map(kind => [
    kind, assetRoot + texture + '-' + kind + '.png',
  ]));
}

export function renderCatalogue() {
  return {
    schema: renderVersion,
    materialSource: 'procedural-preview',
    lightingSpace: 'studio-world',
    surfaces: Object.fromEntries(Object.entries(surfaceProfiles).map(([id, profile]) => [
      id, { ...profile, maps: mapPaths(profile.texture) },
    ])),
    lighting: lightProfiles,
    artifacts: renderArtifacts,
  };
}

export function resolveRenderSpec(design, camera, hasArtwork = Boolean(design.artwork)) {
  const paper = surfaceProfiles[design.material];
  const detail = design.grain / 100;
  const glossAdjustment = (design.gloss - 50) / 100;
  const gloss = design.finish === 'gloss';
  const softTouch = design.finish === 'soft-touch';
  const outside = {
    ...paper,
    colour: design.colour,
    roughness: Math.min(1, Math.max(.34, paper.roughness - glossAdjustment * .36)),
    grain: paper.grain * detail * (gloss ? .48 : 1),
    sheen: softTouch ? .32 : paper.sheen,
    clearcoat: gloss ? .94 : softTouch ? .28 : 0,
    clearcoatRoughness: gloss ? .11 - glossAdjustment * .15 : .58 - glossAdjustment * .18,
  };
  const surfaces = {
    outside,
    lining: { ...surfaceProfiles.lining, colour: design.inside, grain: surfaceProfiles.lining.grain * detail },
    foam: { ...surfaceProfiles.foam, colour: '#27272a', grain: surfaceProfiles.foam.grain * detail },
    foil: { ...surfaceProfiles.foil, colour: design.foil === 'silver' ? '#dedfe5' : '#e1b56c' },
  };
  for (const surface of Object.values(surfaces)) surface.maps = mapPaths(surface.texture);

  return {
    schema: renderVersion,
    materialSource: 'procedural-preview',
    material: design.material,
    finish: design.finish,
    artwork: hasArtwork ? {mode: 'local-image', scale: design.logoScale} : {
      mode: design.foil, text: design.text, subtitle: design.subtitle, scale: design.logoScale,
    },
    studio: { id: design.light, space: 'studio-world', ...lightProfiles[design.light] },
    ...(camera ? {camera} : {}),
    pose: { opening: design.opening, explode: design.explode, yawDegrees: design.yaw },
    geometry: {
      construction: design.construction, lengthMm: design.length, widthMm: design.width,
      heightMm: design.height, lidHeightMm: design.lidHeight, boardMm: design.board,
      clearanceMm: design.clearance, neckMm: design.neck, insert: design.insert,
    },
    approval: 'preview',
    surfaces,
    artifacts: renderArtifacts,
  };
}
