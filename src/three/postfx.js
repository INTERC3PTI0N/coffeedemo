import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * Final grade: radial chromatic aberration, a soft filmic shoulder, a
 * chapter-driven colour cast and a vignette. Bloom sits in front of it so only
 * lit snow and the gold accent bleed.
 */
const GradeShader = {
  uniforms: {
    tDiffuse:    { value: null },
    uAberration: { value: 0.0014 },
    uCast:       { value: new THREE.Color('#ffffff') },
    uCastAmount: { value: 0.0 },
    uContrast:   { value: 1.085 },
    uSaturation: { value: 0.94 },
    uLift:       { value: 0.0 },
    uVignette:   { value: 0.30 },
    uTime:       { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uAberration;
    uniform vec3  uCast;
    uniform float uCastAmount;
    uniform float uContrast;
    uniform float uSaturation;
    uniform float uLift;
    uniform float uVignette;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      vec2 c = vUv - 0.5;
      float r2 = dot(c, c);

      // aberration scales with distance from centre, like a real lens
      vec2 off = c * uAberration * (0.35 + r2 * 2.6);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;

      // chapter cast
      col = mix(col, col * uCast, uCastAmount);

      // lift the blacks toward the fog so nothing crushes
      col = col + uLift * (1.0 - col);

      // contrast + desaturate for the cold documentary feel
      col = (col - 0.5) * uContrast + 0.5;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);

      // soft shoulder
      col = col / (col + 0.34) * 1.34;

      // vignette
      float vig = 1.0 - smoothstep(0.22, 0.92, length(c) * 1.32);
      col *= mix(1.0, vig, uVignette);

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

export function createPostFX(renderer, scene, camera, { quality = 1 } = {}) {
  const size = renderer.getSize(new THREE.Vector2());

  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    colorSpace: THREE.SRGBColorSpace,
    samples: quality > 0.85 ? 2 : 0,
  });

  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x, size.y),
    0.18,   // strength
    0.72,   // radius
    0.90,   // threshold — only genuinely blown highlights and the gold
  );
  composer.addPass(bloom);

  const grade = new ShaderPass(GradeShader);
  grade.renderToScreen = true;
  composer.addPass(grade);

  return { composer, bloom, grade, uniforms: grade.uniforms };
}
