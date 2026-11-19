// Chargement des modèles Kenney (CC0 / MIT, voir public/models/LICENSE-kenney.md).
import * as THREE from 'three';
import { weather } from './models';
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
    const url = `${import.meta.env.BASE_URL}models/${FILES[k]}`;
    let g;
    const embedded = (window as any).__TD_MODELS?.[FILES[k]] as string | undefined;
    if (embedded) {
      // version fichier unique (double-clic) : modèles et textures intégrés
      const bin = Uint8Array.from(atob(embedded), c => c.charCodeAt(0));
      g = await loader.parseAsync(bin.buffer, '');
    } else if (import.meta.env.VITE_GLB_AS_JSON) {
      // version hébergée : le .glb est emballé en base64 dans un .json
      const { b64 } = await (await fetch(url + '.json')).json();
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      g = await loader.parseAsync(bin.buffer, url.slice(0, url.lastIndexOf('/') + 1));
    } else {
      g = await loader.loadAsync(url + '.glb');
    }
    g.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true; m.receiveShadow = true;
        const mat = m.material as THREE.MeshStandardMaterial;
        if (mat.map) { mat.map.colorSpace = THREE.SRGBColorSpace; mat.map.anisotropy = 4; }
        mat.roughness = 0.75; mat.metalness = 0; weather(mat, 0.8);
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
