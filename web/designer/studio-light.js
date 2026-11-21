import * as THREE from 'three';
import {lightProfiles} from './render-spec.js';

export class StudioLight {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.environments = new Map();
    this.rig = new THREE.Group();
    this.rig.name = 'Fixed studio lighting';
    scene.add(this.rig);

    this.key = new THREE.DirectionalLight(0xffffff, 1);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, {left: -.66, right: .66, top: .66, bottom: -.66, near: .02, far: 4});
    this.key.shadow.bias = -.00006;
    this.key.shadow.normalBias = .0007;
    this.key.shadow.radius = 3;
    this.rig.add(this.key, this.key.target);
    this.key.target.position.y = .06;
  }

  setPreset(id) {
    if (id === this.preset) return;
    const preset = lightProfiles[id];
    let environment = this.environments.get(id);
    if (!environment) {
      // A studio built from luminous cards provides distinctive highlights at
      // grazing angles. Capture it once, independently of the product camera.
      const room = new THREE.Scene();
      room.background = new THREE.Color(preset.ambient);
      for (const card of preset.cards) {
        const plane = new THREE.Mesh(
          new THREE.PlaneGeometry(...card.size),
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(card.colour).multiplyScalar(card.radiance),
            toneMapped: false,
          }),
        );
        plane.position.fromArray(card.position);
        plane.lookAt(0, .06, 0);
        room.add(plane);
      }
      environment = this.pmrem.fromScene(room, .018, .05, 10, {size: 256});
      room.traverse(object => {
        object.geometry?.dispose();
        object.material?.dispose();
      });
      this.environments.set(id, environment);
    }
    this.scene.background.set(preset.background);
    this.scene.environment = environment.texture;
    this.scene.environmentIntensity = preset.environment;
    this.renderer.toneMappingExposure = preset.exposure;
    this.key.position.fromArray(preset.key);
    this.key.color.set(preset.keyColor);
    this.key.intensity = preset.shadow;
    this.preset = id;
  }
}
