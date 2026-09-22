import * as THREE from 'three';

/**
 * The mountain range.
 *
 * A cut-out ridgeline photographed against open sky, repeated as a stack of
 * depth layers. Each layer sits at its own distance, so the scroll-driven
 * camera produces true perspective parallax rather than a faked scroll offset:
 * near ridges sweep past while far ones barely shift.
 *
 * Layers are mirrored, offset and re-proportioned against each other so the
 * same silhouette does not read as a repeat, and each is washed further into
 * the fog with distance, which is what sells the aerial perspective.
 */

const ASPECT = 2000 / 1030;   // the trimmed artwork

const VERT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;

  uniform sampler2D uMap;
  uniform vec3  uFog;
  uniform vec3  uTint;
  uniform vec3  uShadow;
  uniform float uDepth;      // 0 = front layer, 1 = furthest
  uniform float uOpacity;
  uniform float uDeckY;
  uniform float uExposure;
  uniform float uFlip;

  varying vec2 vUv;
  varying vec3 vWorld;

  void main() {
    vec2 uv = vec2(mix(vUv.x, 1.0 - vUv.x, uFlip), vUv.y);
    vec4 tex = texture2D(uMap, uv);
    if (tex.a < 0.004) discard;

    vec3 col = tex.rgb * uTint * uExposure;

    // the artwork's own shading is cool and bright; deepen the near layers so
    // the stack reads front-to-back even before the fog does its work
    col = mix(col, col * uShadow, (1.0 - uDepth) * 0.34);

    // aerial perspective — distance drains contrast into the sky colour
    col = mix(col, uFog, pow(uDepth, 0.85) * 0.82);

    float a = tex.a * uOpacity;

    // The artwork runs to its own borders, so an untreated quad ends in a hard
    // vertical cut — and mipmapping smears those opaque edge texels outward.
    // Feather the sides and base so each layer resolves into the fog instead.
    a *= smoothstep(0.0, 0.085, vUv.x) * smoothstep(1.0, 0.915, vUv.x);
    a *= smoothstep(0.0, 0.20, vUv.y);

    // the range stands in the weather: everything at deck level dissolves
    a *= smoothstep(uDeckY - 300.0, uDeckY + 420.0, vWorld.y);

    // and the furthest layers are barely there at all
    a *= mix(1.0, 0.48, uDepth);

    if (a < 0.003) discard;

    gl_FragColor = vec4(col, a);
    #include <colorspace_fragment>
  }
`;

/**
 * @param {THREE.Texture} texture  the ridgeline cut-out
 * @param {object[]} layers        [{ z, width, baseY, x, flip, depth }]
 */
export function createRidgeline(texture, { layers, deckY = 300 } = {}) {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(1, 1);
  const built = [];

  layers.forEach((spec, i) => {
    const width = spec.width;
    const height = width / ASPECT;

    const uniforms = {
      uMap:      { value: texture },
      uFog:      { value: new THREE.Color('#dfe6eb') },
      uTint:     { value: new THREE.Color('#ffffff') },
      uShadow:   { value: new THREE.Color('#8fa6bd') },
      uDepth:    { value: spec.depth },
      uOpacity:  { value: 1 },
      uDeckY:    { value: deckY },
      uExposure: { value: 1 },
      uFlip:     { value: spec.flip ? 1 : 0 },
    };

    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(width, height, 1);
    // the plane is centred, so lift it by half its height to sit on baseY
    mesh.position.set(spec.x ?? 0, spec.baseY + height / 2, spec.z);
    mesh.frustumCulled = false;
    // furthest layers draw first so the near ones composite over them
    mesh.renderOrder = -10 + i;

    group.add(mesh);
    built.push({ mesh, uniforms, spec, height });
  });

  // near layers must draw last: sort back-to-front by distance
  built.sort((a, b) => a.spec.z - b.spec.z);
  built.forEach((l, i) => { l.mesh.renderOrder = -20 + i; });

  return {
    group,
    layers: built,

    /** Push the chapter palette into every layer. */
    setGrade(fog, tint, exposure) {
      for (const l of built) {
        l.uniforms.uFog.value.copy(fog);
        l.uniforms.uTint.value.copy(tint);
        l.uniforms.uExposure.value = exposure;
      }
    },

    setOpacity(v) {
      for (const l of built) l.uniforms.uOpacity.value = v;
      group.visible = v > 0.01;
    },

    /**
     * Storytelling drift: as the journey advances the stack fans apart —
     * near ridges slide and settle faster than far ones, so the range opens
     * up around the camera instead of sitting still behind it.
     */
    setDrift(t) {
      for (let i = 0; i < built.length; i++) {
        const l = built[i];
        const near = 1 - l.spec.depth;          // 1 at the front, 0 at the back
        l.mesh.position.x = (l.spec.x ?? 0) + t * near * 420 * (l.spec.flip ? -1 : 1);
        l.mesh.position.y = l.spec.baseY + l.height / 2 - t * near * 180;
      }
    },
  };
}

/** The range that carries the descent, front to back. */
export const MAIN_LAYERS = [
  { z:  -2200, width: 4400, baseY: -300, x:  260, flip: false, depth: 0.00 },
  { z:  -3600, width: 5200, baseY: -340, x: -520, flip: true,  depth: 0.20 },
  { z:  -5400, width: 6300, baseY: -380, x:  680, flip: false, depth: 0.42 },
  { z:  -7600, width: 7500, baseY: -430, x: -300, flip: true,  depth: 0.62 },
  { z: -10200, width: 9100, baseY: -500, x:  420, flip: false, depth: 0.80 },
  { z: -13000, width: 11000, baseY: -580, x: -640, flip: true,  depth: 0.93 },
];

/** A fresh range for the closing climb into dawn. */
export const DAWN_LAYERS = [
  { z:  -6200, width: 4800, baseY: -820, x: -420, flip: true,  depth: 0.08 },
  { z:  -7800, width: 5900, baseY: -880, x:  560, flip: false, depth: 0.30 },
  { z:  -9800, width: 7200, baseY: -940, x: -260, flip: true,  depth: 0.54 },
  { z: -12400, width: 8800, baseY: -1010, x: 480, flip: false, depth: 0.76 },
  { z: -15500, width: 10700, baseY: -1090, x: -560, flip: true, depth: 0.92 },
];
