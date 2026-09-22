import * as THREE from 'three';
import { NOISE } from './glsl/noise.js';

/**
 * Procedural alpine massif.
 *
 * A single high-resolution plane displaced by a ridged multifractal, with a
 * planted "hero" peak so the silhouette is art-directed rather than random.
 * Normals are derived in the vertex shader by finite differences against the
 * same height function, so the lighting tracks the displacement exactly.
 */

const HEIGHT_FN = /* glsl */ `
  uniform float uAmp;
  uniform float uFreq;
  uniform float uSeed;
  uniform vec2  uPeakA;
  uniform vec2  uPeakB;
  uniform vec2  uPeakC;
  uniform float uNormalEps;

  float bump(vec2 p, vec2 c, float r, float h) {
    float d = length(p - c) / r;
    return h * exp(-d * d * 1.22);
  }

  float terrainHeight(vec2 p) {
    vec3 q = vec3(p * uFreq, uSeed);

    // crest detail — low frequency so the mesh can actually resolve the ridges
    float r = ridged(q, 5, 2.04, 0.48);

    // massif distribution — keeps the range clustered instead of uniform noise
    float massif = fbm(vec3(p * 0.00022, uSeed * 0.37), 3, 2.0, 0.5) * 0.5 + 0.5;

    // the base field stays low: the cloud deck is meant to drown it
    float h = r * uAmp * (0.10 + massif * 0.52);

    // art-directed summits — these are what break the deck
    h += bump(p, uPeakA, 1500.0, uAmp * 2.40) * (0.60 + r * 0.72);
    h += bump(p, uPeakB, 1150.0, uAmp * 1.58) * (0.58 + r * 0.68);
    h += bump(p, uPeakC, 1700.0, uAmp * 1.10) * (0.56 + r * 0.64);

    return h;
  }
`;

const VERT = /* glsl */ `
  ${NOISE}
  ${HEIGHT_FN}

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec2 p = wp.xz;

    float h = terrainHeight(p);
    wp.y += h;
    vHeight = h;

    // finite-difference normals against the same height field, sampled at
    // roughly the grid spacing so they describe facets rather than noise
    float e = uNormalEps;
    float hx = terrainHeight(p + vec2(e, 0.0));
    float hz = terrainHeight(p + vec2(0.0, e));
    vNormal = normalize(vec3(h - hx, e, h - hz));

    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform vec3  uRock;
  uniform vec3  uSnow;
  uniform vec3  uShadow;
  uniform vec3  uFog;
  uniform vec3  uLightDir;
  uniform float uFogDensity;
  uniform float uSnowLine;
  uniform float uExposure;
  uniform float uOpacity;
  uniform float uDeckY;

  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vHeight;

  void main() {
    vec3 n = normalize(vNormal);

    // snow settles on the flats and the high ground; rock shows on the faces
    float slope = smoothstep(0.34, 0.86, n.y);
    float alt   = smoothstep(uSnowLine * 0.35, uSnowLine, vHeight);
    float snow  = clamp(slope * 0.65 + alt * 0.68, 0.0, 1.0);
    snow = smoothstep(0.18, 0.92, snow);

    vec3 albedo = mix(uRock, uSnow, snow);

    // key light, raking from behind-left as in the reference plate
    float diff = clamp(dot(n, normalize(uLightDir)), 0.0, 1.0);
    float wrap = clamp((dot(n, normalize(uLightDir)) + 0.45) / 1.45, 0.0, 1.0);
    float sky  = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);

    vec3 lit = albedo * (0.19 + wrap * 0.46 + diff * 0.31);
    lit = mix(lit, uShadow, (1.0 - wrap) * 0.52);      // cold blue in the lee
    lit += uSnow * sky * 0.10 * snow;                   // bounce off the cloud deck

    // rim — separates the ridge line from the fog behind it
    vec3 viewDir = normalize(cameraPosition - vWorld);
    float rim = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 2.4);
    lit += uSnow * rim * 0.14;

    lit *= uExposure;

    // heavy exponential-squared fog is what fuses the peaks into the cloud sea
    float dist = length(cameraPosition - vWorld);
    float fogAmt = 1.0 - exp(-pow(dist * uFogDensity, 2.0));

    // ground haze: only what sits in the deck is swallowed by it
    float low = 1.0 - smoothstep(uDeckY - 180.0, uDeckY + 190.0, vWorld.y);
    fogAmt = clamp(fogAmt + low * 0.94, 0.0, 1.0);

    vec3 col = mix(lit, uFog, fogAmt);

    gl_FragColor = vec4(col, uOpacity);
    #include <colorspace_fragment>
  }
`;

export function createTerrain({
  size = 13000,
  segments = 340,
  amplitude = 430,
  frequency = 0.00078,
  seed = 12.7,
  deckY = 200,
  peaks = [[620, -2100], [-1700, -3100], [2600, -4300]],
} = {}) {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const uniforms = {
    uAmp:        { value: amplitude },
    uFreq:       { value: frequency },
    uSeed:       { value: seed },
    uPeakA:      { value: new THREE.Vector2(...peaks[0]) },
    uPeakB:      { value: new THREE.Vector2(...peaks[1]) },
    uPeakC:      { value: new THREE.Vector2(...peaks[2]) },
    uNormalEps:  { value: (size / segments) * 0.9 },
    uRock:       { value: new THREE.Color('#3a444e') },
    uSnow:       { value: new THREE.Color('#eaf0f4') },
    uShadow:     { value: new THREE.Color('#6d89a8') },
    uFog:        { value: new THREE.Color('#dfe6eb') },
    uLightDir:   { value: new THREE.Vector3(-0.48, 0.58, -0.66) },
    uFogDensity: { value: 0.000105 },
    uSnowLine:   { value: 520 },
    uExposure:   { value: 1.0 },
    uOpacity:    { value: 1.0 },
    uDeckY:      { value: deckY },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 1;

  return { mesh, uniforms, material, geometry };
}
