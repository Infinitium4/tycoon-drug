// Rendu « réaliste » : occlusion ambiante (ombres de contact), bloom (lumières qui bavent),
// étalonnage couleur façon film (moins saturé, contraste, vignette, grain), anti-crénelage.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uNight: { value: 0 }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uNight; uniform float uTime; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, mix(0.78, 0.7, uNight));                 // désaturation
      col *= mix(vec3(1.03, 1.0, 0.95), vec3(0.85, 0.93, 1.12), uNight); // jour chaud / nuit bleutée
      col = mix(col, col * col * 1.15 + col * 0.0, 0.18);               // contraste doux
      vec2 d = vUv - 0.5; float v = smoothstep(0.85, 0.25, length(d * vec2(1.1, 1.0)));
      col *= mix(0.72, 1.0, v);                                         // vignette
      col += (hash(vUv * 900.0 + uTime) - 0.5) * 0.025;                 // grain
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  composer: EffectComposer;
  enabled = true;
  ao: GTAOPass;
  bloom: UnrealBloomPass;
  aoScale = 0.6;
  private grade: ShaderPass;
  constructor(private renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new GTAOPass(scene, camera, 1, 1);
    this.ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 12 });
    this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.ao.blendIntensity = 0.85;
    const aoSet = this.ao.setSize.bind(this.ao);
    this.ao.setSize = (w: number, h: number) => aoSet(Math.max(1, Math.floor(w * this.aoScale)), Math.max(1, Math.floor(h * this.aoScale)));
    const bm = (this.ao as unknown as { blendMaterial: THREE.ShaderMaterial }).blendMaterial;
    bm.fragmentShader = bm.fragmentShader.replace('mix(vec3(1.), texel.rgb, intensity), texel.a', 'mix(vec3(1.), min(texel.rgb, vec3(1.)), intensity), 1.0');
    // ne pas calculer d'occlusion pour les halos, sprites et surfaces transparentes (sang, rubalise…)
    const ao = this.ao as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] };
    const base = ao._overrideVisibility.bind(ao);
    ao._overrideVisibility = () => {
      base();
      scene.traverse(o => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (o.visible && ((o as THREE.Sprite).isSprite || ((o as THREE.Mesh).isMesh && m && !Array.isArray(m) && m.transparent))) { o.visible = false; ao._visibilityCache.push(o); }
      });
    };
    this.composer.addPass(this.ao);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.5, 0.92);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    try { this.enabled = localStorage.getItem('td-fx') !== '0'; } catch { /* stockage indisponible */ }
  }
  setSize(w: number, h: number) {
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }
  toggle() { this.enabled = !this.enabled; try { localStorage.setItem('td-fx', this.enabled ? '1' : '0'); } catch { /* */ } return this.enabled; }
  render(night: number, time: number) {
    this.bloom.strength = 0.28 + night * 0.3;
    this.bloom.threshold = 0.9 - night * 0.12;
    this.grade.uniforms.uNight.value = night;
    this.grade.uniforms.uTime.value = time % 100;
    this.composer.render();
  }
}
