import * as THREE from 'three';
import { NOISE } from './glsl/noise.js';

/**
 * Storm sea for the Divisions chapter.
 *
 * Summed Gerstner waves give the swell its sharp crests and broad troughs;
 * fbm on top supplies chop. Foam is driven by crest curvature so it appears
 * where the water is actually steepest.
 */

const GERSTNER = /* glsl */ `
  // returns displacement; accumulates the tangent basis through the inouts
  vec3 gerstner(vec2 p, vec2 dir, float amp, float len, float steep, float t,
                inout vec3 tangent, inout vec3 binormal) {
    float k = 6.28318 / len;
    float c = sqrt(9.8 / k);
    vec2  d = normalize(dir);
    float f = k * (dot(d, p) - c * t);
    float a = steep / k;

    tangent  += vec3(-d.x * d.x * (steep * sin(f)), d.x * (steep * cos(f)), -d.x * d.y * (steep * sin(f)));
    binormal += vec3(-d.x * d.y * (steep * sin(f)), d.y * (steep * cos(f)), -d.y * d.y * (steep * sin(f)));

    return vec3(d.x * (a * cos(f)), amp * sin(f), d.y * (a * cos(f)));
  }
`;

const VERT = /* glsl */ `
  ${NOISE}
  ${GERSTNER}

  uniform float uTime;
  uniform float uAmp;
  uniform float uChop;

  varying vec3  vWorld;
  varying vec3  vNormal;
  varying float vCrest;

  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vec2 p = wp.xz;

    vec3 tangent  = vec3(1.0, 0.0, 0.0);
    vec3 binormal = vec3(0.0, 0.0, 1.0);
    vec3 disp = vec3(0.0);

    disp += gerstner(p, vec2( 1.0,  0.25), uAmp * 1.00, 2600.0, 0.58, uTime, tangent, binormal);
    disp += gerstner(p, vec2( 0.68, -0.72), uAmp * 0.58, 1500.0, 0.46, uTime, tangent, binormal);
    disp += gerstner(p, vec2(-0.42,  0.90), uAmp * 0.32,  820.0, 0.34, uTime, tangent, binormal);
    disp += gerstner(p, vec2( 0.14, -0.99), uAmp * 0.17,  420.0, 0.24, uTime, tangent, binormal);

    // wind chop
    float chop = fbm(vec3(p * 0.0026, uTime * 0.22), 4, 2.2, 0.5) * uChop;
    disp.y += chop;

    wp.xyz += disp;
    vWorld  = wp.xyz;
    vNormal = normalize(cross(binormal, tangent));
    vCrest  = clamp(disp.y / max(uAmp * 1.7, 0.001), -1.0, 1.0);

    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  ${NOISE}

  uniform float uTime;
  uniform vec3  uDeep;
  uniform vec3  uShallow;
  uniform vec3  uFoam;
  uniform vec3  uFog;
  uniform vec3  uLightDir;
  uniform float uFogDensity;
  uniform float uOpacity;

  varying vec3  vWorld;
  varying vec3  vNormal;
  varying float vCrest;

  void main() {
    vec3 n = normalize(vNormal);
    vec3 viewDir = normalize(cameraPosition - vWorld);

    float fres = pow(1.0 - clamp(dot(n, viewDir), 0.0, 1.0), 3.2);
    float diff = clamp(dot(n, normalize(uLightDir)) * 0.5 + 0.5, 0.0, 1.0);

    vec3 col = mix(uDeep, uShallow, diff * 0.75 + fres * 0.5);

    // foam rides the steep crests, torn up by noise
    float tear = fbm(vec3(vWorld.xz * 0.0055, uTime * 0.3), 4, 2.3, 0.5) * 0.5 + 0.5;
    float foam = smoothstep(0.66, 1.02, vCrest * 0.80 + tear * 0.38);
    foam *= smoothstep(0.34, 0.80, tear);
    col = mix(col, uFoam, foam * 0.55);

    // spec glint off the swell
    vec3 h = normalize(normalize(uLightDir) + viewDir);
    col += uFoam * pow(clamp(dot(n, h), 0.0, 1.0), 42.0) * 0.30;

    float dist = length(cameraPosition - vWorld);
    float fogAmt = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
    col = mix(col, uFog, fogAmt);

    gl_FragColor = vec4(col, uOpacity);
    #include <colorspace_fragment>
  }
`;

export function createOcean({ size = 9000, segments = 300, y = -620 } = {}) {
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const uniforms = {
    uTime:       { value: 0 },
    uAmp:        { value: 42 },
    uChop:       { value: 5.0 },
    uDeep:       { value: new THREE.Color('#0d141b') },
    uShallow:    { value: new THREE.Color('#33434f') },
    uFoam:       { value: new THREE.Color('#c3ced6') },
    uFog:        { value: new THREE.Color('#1a222b') },
    uLightDir:   { value: new THREE.Vector3(-0.4, 0.55, -0.73) },
    uFogDensity: { value: 0.00052 },
    uOpacity:    { value: 0.0 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: true,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = y;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.visible = false;

  return { mesh, uniforms, material, geometry };
}
