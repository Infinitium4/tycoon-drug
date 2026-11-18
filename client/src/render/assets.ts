// Chargement des modèles Kenney (CC0 / MIT, voir public/models/LICENSE-kenney.md).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const FILES = {
  truckRed: 'racing/vehicle-truck-red',
  truckYellow: 'racing/vehicle-truck-yellow',
  truckGreen: 'racing/vehicle-truck-green',
  truckPurple: 'racing/vehicle-truck-purple',
  moto: 'racing/vehicle-motorcycle',
  bA: 'city/building-small-a',
  bB: 'city/building-small-b',
  bC: 'city/building-small-c',
  bD: 'city/building-small-d',
  bGarage: 'city/building-garage',
  fountain: 'city/pavement-fountain',
  roadLamp: 'city/road-straight-lightposts',
  tree: 'basic/tree-round',
  treesTall: 'city/grass-trees-tall',
  blaster: 'fps/blaster',
} as const;
export type AssetKey = keyof typeof FILES;

const cache = new Map<AssetKey, THREE.Object3D>();

export async function loadAssets(onProgress?: (p: number) => void) {
  const loader = new GLTFLoader();
  const keys = Object.keys(FILES) as AssetKey[];
  let done = 0;
  await Promise.all(keys.map(async k => {
    const g = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${FILES[k]}.glb`);
    g.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true; m.receiveShadow = true;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.map) { mat.map.colorSpace = THREE.SRGBColorSpace; mat.map.anisotropy = 4; }
        mat.roughness = 0.75; mat.metalness = 0;
      }
    });
    cache.set(k, g.scene);
    onProgress?.(++done / keys.length);
  }));
}

/** Copie d'un modèle, mis à l'échelle et posé au sol. */
export function model(k: AssetKey, scale = 1): THREE.Group {
  const src = cache.get(k);
  if (!src) throw new Error('asset non chargé : ' + k);
  const o = src.clone(true);
  o.scale.setScalar(scale);
  const g = new THREE.Group(); g.add(o);
  return g;
}
