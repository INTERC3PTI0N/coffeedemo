import * as THREE from 'three';
import { NOISE } from './glsl/noise.js';

/**
 * Volumetric cloud deck.
 *
 * A slab of camera-facing billboards, each shaded by world-space fbm so no two
 * puffs repeat, with near/far alpha ramps so the camera can fly *through* the
 * deck without popping. Cheap enough to hold 60fps, thick enough to read as
 * real volume when the camera descends into it.
 */

const VERT = /* glsl */ `
  attribute vec3  aOffset;
  attribute vec2  aScale;
  attribute float aSeed;
  attribute float aRot;
  attribute float aAlpha;

  uniform float uTime;
  uniform float uDrift;
  uniform float uSpread;

  varying vec2  vUv;
  varying float vSeed;
  varying float vAlpha;
  varying vec3  vWorld;

  void main() {
    vUv    = uv;
    vSeed  = aSeed;
    vAlpha = aAlpha;

    vec3 origin = aOffset;

    // slow lateral drift + gentle vertical breathing, phase-offset per puff
    origin.x += sin(uTime * 0.045 + aSeed * 6.283) * uDrift;
    origin.z += cos(uTime * 0.037 + aSeed * 4.712) * uDrift * 0.6;
    origin.y += sin(uTime * 0.058 + aSeed * 9.424) * uDrift * 0.16;

    // wrap the slab around the camera so the deck never runs out
    vec3 camPos = cameraPosition;
    origin.x -= uSpread * floor((origin.x - camPos.x) / uSpread + 0.5);
    origin.z -= uSpread * floor((origin.z - camPos.z) / uSpread + 0.5);

    // spherical billboard
    vec3 camRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 camUp    = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);

    vec2 q = position.xy * aScale;
    float c = cos(aRot), s = sin(aRot);
    vec2 rq = vec2(q.x * c - q.y * s, q.x * s + q.y * c);

    vec3 world = origin + camRight * rq.x + camUp * rq.y;
    vWorld = world;

    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  ${NOISE}

  uniform float uTime;
  uniform float uDensity;
  uniform float uSoft;
  uniform float uNearFade;
  uniform float uFarFade;
  uniform vec3  uLight;
  uniform vec3  uDark;
  uniform vec3  uTint;
  uniform float uTintAmount;
  uniform vec3  uLightDir;
  uniform float uDeckY;

  varying vec2  vUv;
  varying float vSeed;
  varying float vAlpha;
  varying vec3  vWorld;

  void main() {
    // gaussian-ish envelope — no hard rim anywhere on the quad
    vec2 d = vUv - 0.5;
    float r = clamp(length(d) * 2.0, 0.0, 1.0);
    float envelope = exp(-r * r * 3.4) - 0.0334;   // ~0 at the edge, smooth throughout
    if (envelope <= 0.0) discard;

    // world-space fbm keeps neighbouring puffs coherent instead of tiled
    vec3 np = vec3(vWorld.xz * 0.0016, vWorld.y * 0.0016 + uTime * 0.012) + vSeed * 7.31;
    float n  = fbm(np, 4, 2.15, 0.52) * 0.5 + 0.5;
    float n2 = fbm(np * 3.1 + 11.0, 3, 2.3, 0.5) * 0.5 + 0.5;
    float body = n * 0.72 + n2 * 0.28;

    // keep the noise as a gentle modulation rather than a cutout, so the puff
    // stays a soft blob instead of acquiring crisp noise silhouettes
    float a = envelope * mix(1.0, body, uSoft);
    a *= vAlpha * uDensity;

    // depth ramps — dissolve rather than clip when the camera passes through
    float dist = distance(vWorld, cameraPosition);
    a *= smoothstep(uNearFade * 0.04, uNearFade, dist);
    a *= 1.0 - smoothstep(uFarFade * 0.45, uFarFade, dist);

    if (a <= 0.002) discard;

    // form: lit crowns, cool bellies
    float lift = clamp((vWorld.y - uDeckY) / 420.0 + 0.5, 0.0, 1.0);
    float shade = clamp(body * 0.55 + lift * 0.6, 0.0, 1.0);
    vec3 col = mix(uDark, uLight, smoothstep(0.26, 0.82, shade));

    // directional warmth on the sun side
    float side = clamp(dot(normalize(vec3(d.x, d.y, 0.55)), normalize(uLightDir)) * 0.5 + 0.5, 0.0, 1.0);
    col = mix(col, uTint, side * uTintAmount);

    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

export function createClouds({
  count = 620,
  spread = 6400,
  deckY = 0,
  thickness = 520,
  minScale = 340,
  maxScale = 1250,
} = {}) {
  const base = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.index = base.index;
  geometry.attributes.position = base.attributes.position;
  geometry.attributes.uv = base.attributes.uv;
  geometry.instanceCount = count;

  const offsets = new Float32Array(count * 3);
  const scales  = new Float32Array(count * 2);
  const seeds   = new Float32Array(count);
  const rots    = new Float32Array(count);
  const alphas  = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // bias toward the deck plane so the slab has a defined top and bottom
    const t = Math.random();
    const bias = Math.pow(Math.random(), 1.7) * (Math.random() < 0.5 ? -1 : 1);

    offsets[i * 3 + 0] = (Math.random() - 0.5) * spread;
    offsets[i * 3 + 1] = deckY + bias * thickness;
    offsets[i * 3 + 2] = (Math.random() - 0.5) * spread;

    const s = minScale + Math.pow(Math.random(), 0.7) * (maxScale - minScale);
    scales[i * 2 + 0] = s;
    scales[i * 2 + 1] = s * (0.44 + Math.random() * 0.34);   // squat, like real deck cloud

    seeds[i]  = Math.random();
    rots[i]   = Math.random() * Math.PI * 2;
    alphas[i] = 0.22 + (1.0 - Math.abs(bias)) * 0.52 * (0.7 + t * 0.3);
  }

  geometry.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  geometry.setAttribute('aScale',  new THREE.InstancedBufferAttribute(scales, 2));
  geometry.setAttribute('aSeed',   new THREE.InstancedBufferAttribute(seeds, 1));
  geometry.setAttribute('aRot',    new THREE.InstancedBufferAttribute(rots, 1));
  geometry.setAttribute('aAlpha',  new THREE.InstancedBufferAttribute(alphas, 1));

  const uniforms = {
    uTime:       { value: 0 },
    uDrift:      { value: 120 },
    uSpread:     { value: spread },
    uDensity:    { value: 1.0 },
    uSoft:       { value: 0.72 },
    uNearFade:   { value: 240 },
    uFarFade:    { value: 9000 },
    uLight:      { value: new THREE.Color('#ffffff') },
    uDark:       { value: new THREE.Color('#b9c6d1') },
    uTint:       { value: new THREE.Color('#ffffff') },
    uTintAmount: { value: 0.0 },
    uLightDir:   { value: new THREE.Vector3(-0.55, 0.42, 0.72) },
    uDeckY:      { value: deckY },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;

  return { mesh, uniforms, material, geometry };
}
