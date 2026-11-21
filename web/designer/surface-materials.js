import * as THREE from 'three';

const faceAxes = [[2, 1], [2, 1], [0, 2], [0, 2], [0, 1], [0, 1]];

export function scalePanelUVs(geometry, sizeMm, surfaces) {
  const uv = geometry.getAttribute('uv');
  for (const {start, count, materialIndex} of geometry.groups) {
    const [u, v] = faceAxes[materialIndex];
    const tile = surfaces[materialIndex].tileMm;
    for (let index = start; index < start + count; index++) {
      uv.setXY(index, uv.getX(index) * sizeMm[u] / tile, uv.getY(index) * sizeMm[v] / tile);
    }
  }
}

export class SurfaceMaterials {
  constructor(renderer) {
    this.loader = new THREE.TextureLoader();
    this.cache = new Map();
    this.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
  }

  load(url, colour, channel = 0) {
    const key = url + '#' + channel;
    if (!this.cache.has(key)) {
      const pending = this.loader.loadAsync(url).then(texture => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.anisotropy = this.anisotropy;
        texture.channel = channel;
        return texture;
      }).catch(() => {
        this.cache.delete(key);
        return null;
      });
      this.cache.set(key, pending);
    }
    return this.cache.get(key);
  }

  async build(profile) {
    const [map, normalMap, roughnessMap] = await Promise.all([
      this.load(profile.maps.colour, true),
      this.load(profile.maps.normal, false),
      this.load(profile.maps.roughness, false),
    ]);
    const normalScale = new THREE.Vector2(profile.grain, profile.grain);
    return new THREE.MeshPhysicalMaterial({
      color: profile.colour,
      map, normalMap, normalScale, roughnessMap,
      roughness: profile.roughness,
      clearcoat: profile.clearcoat ?? 0,
      clearcoatRoughness: profile.clearcoatRoughness ?? .6,
      clearcoatNormalMap: profile.clearcoat ? normalMap : null,
      clearcoatNormalScale: new THREE.Vector2(profile.grain * .24, profile.grain * .24),
      sheen: profile.sheen,
      sheenRoughness: .9,
      sheenColor: new THREE.Color(profile.colour).lerp(new THREE.Color('white'), .18),
    });
  }

  async foil(profile, map) {
    const [normalMap, roughnessMap] = await Promise.all([
      this.load(profile.maps.normal, false, 1),
      this.load(profile.maps.roughness, false, 1),
    ]);
    return new THREE.MeshPhysicalMaterial({
      color: profile.colour, map, normalMap, roughnessMap,
      normalScale: new THREE.Vector2(profile.grain, profile.grain),
      metalness: 1, roughness: profile.roughness,
      anisotropy: .28, alphaTest: .18,
    });
  }
}
