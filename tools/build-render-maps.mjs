import fs from 'node:fs/promises';
import path from 'node:path';
import pngjs from 'pngjs';
import {surfaceProfiles} from '../web/designer/render-spec.js';

const {PNG} = pngjs;
const size = 256;
const profiles = {
  'fine-paper': { seed: 1, fibre: .64, rough: .91, variance: .035 },
  buckram: { seed: 2, fibre: .22, weave: 29, rough: .96, variance: .08 },
  coated: { seed: 3, fibre: .15, rough: .95, variance: .02 },
  kraft: { seed: 4, fibre: 1.2, rough: .88, variance: .12 },
  'fine-weave': { seed: 5, fibre: .38, weave: 43, rough: .92, variance: .055 },
  foam: { seed: 6, fibre: 1.3, rough: .95, variance: .14 },
  foil: { seed: 7, fibre: .22, rough: .8, variance: .03 },
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const byte = value => Math.round(clamp(value, 0, 1) * 255);
const mix = (a, b, t) => a + (b - a) * t;

function noise(seed, periodX, periodY, u, v) {
  const x = u * periodX;
  const y = v * periodY;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const sample = (a, b) => {
    let value = Math.imul(a % periodX + 1, 374761393) ^ Math.imul(b % periodY + 1, 668265263) ^ seed;
    value = Math.imul(value ^ (value >>> 13), 1274126177);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
  };
  const smooth = q => q * q * (3 - 2 * q);
  return mix(
    mix(sample(ix, iy), sample(ix + 1, iy), smooth(x - ix)),
    mix(sample(ix, iy + 1), sample(ix + 1, iy + 1), smooth(x - ix)),
    smooth(y - iy),
  );
}

function maps(profile) {
  const images = Object.fromEntries(['colour', 'normal', 'roughness'].map(kind => [
    kind, new PNG({width: size, height: size}),
  ]));
  const height = new Float32Array(size * size);
  const variation = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const mottling = noise(profile.seed, 8, 8, u, v);
      const fibre = noise(profile.seed + 23, 42, 119, u, v);
      const fleck = noise(profile.seed + 91, 157, 89, u, v);
      const n = profile.weave ?? 0;
      const warp = Math.cos(2 * Math.PI * u * n);
      const weft = Math.cos(2 * Math.PI * v * n);
      const weave = n ? .18 * (warp + weft) + .16 * warp * weft : 0;
      const index = y * size + x;
      height[index] = (fibre * .47 + fleck * .35) * profile.fibre + weave;
      variation[index] = clamp(mottling * .45 + fibre * .38 + (weave + .36) * .25, 0, 1);
    }
  }
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const index = y * size + x;
      const offset = index * 4;
      const nx = at(x - 1, y) - at(x + 1, y);
      const ny = at(x, y + 1) - at(x, y - 1);
      const norm = Math.hypot(nx, ny, 1);
      images.normal.data.set([byte(.5 + nx / norm * .5), byte(.5 + ny / norm * .5), byte(.5 + .5 / norm), 255], offset);
      const tint = byte(1 - profile.variance * (1 - variation[index]));
      images.colour.data.set([tint, tint, tint, 255], offset);
      // glTF packs roughness in green and metalness in blue.
      const roughness = byte(profile.rough + (variation[index] - .5) * .28);
      images.roughness.data.set([255, roughness, 255, 255], offset);
    }
  }
  return images;
}

export async function buildRenderMaps(directory) {
  await fs.mkdir(directory, {recursive: true});
  const textures = new Set(Object.values(surfaceProfiles).map(profile => profile.texture));
  for (const id of textures) {
    for (const [kind, png] of Object.entries(maps(profiles[id]))) {
      await fs.writeFile(path.join(directory, id + '-' + kind + '.png'), PNG.sync.write(png));
    }
  }
}
