import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * The reference ingot — its own small renderer, parked in the Vault chapter.
 * Drag to spin; let go and it keeps a little momentum before settling back
 * into its idle rotation.
 */

function makeIngotGeometry({ w = 2.05, h = 0.72, d = 1.12, taper = 0.16, bevel = 0.07 } = {}) {
  const shape = new THREE.Shape();
  const rw = w / 2 - bevel;
  const rd = d / 2 - bevel;
  const r = 0.11;

  shape.moveTo(-rw + r, -rd);
  shape.lineTo(rw - r, -rd);
  shape.quadraticCurveTo(rw, -rd, rw, -rd + r);
  shape.lineTo(rw, rd - r);
  shape.quadraticCurveTo(rw, rd, rw - r, rd);
  shape.lineTo(-rw + r, rd);
  shape.quadraticCurveTo(-rw, rd, -rw, rd - r);
  shape.lineTo(-rw, -rd + r);
  shape.quadraticCurveTo(-rw, -rd, -rw + r, -rd);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: h - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 10,
  });

  geo.rotateX(-Math.PI / 2);
  geo.center();

  // taper the sides so it reads as a cast bar, not a box
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 1 - ((y + h / 2) / h) * taper;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  return geo;
}

function makeStampTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 560;
  const g = c.getContext('2d');

  g.fillStyle = '#000000';
  g.fillRect(0, 0, c.width, c.height);

  g.strokeStyle = '#ffffff';
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';

  g.globalAlpha = 0.5;
  g.lineWidth = 3;
  g.strokeRect(58, 58, c.width - 116, c.height - 116);

  g.globalAlpha = 0.95;
  g.font = '300 132px "Jost", sans-serif';
  g.fillText('999.9', c.width / 2, 250);

  g.globalAlpha = 0.72;
  g.font = '400 40px "Azeret Mono", monospace';
  g.letterSpacing = '14px';
  g.fillText('FINE GOLD', c.width / 2, 330);

  g.globalAlpha = 0.45;
  g.font = '400 30px "Azeret Mono", monospace';
  g.fillText('000 / 999', c.width / 2, 420);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createVault(container, { reducedMotion = false } = {}) {
  if (!container) return null;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.88;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
  camera.position.set(0, 1.35, 4.4);
  camera.lookAt(0, 0, 0);

  // procedural environment gives the metal something to reflect
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.06).texture;

  const key = new THREE.DirectionalLight('#fff1d2', 2.1);
  key.position.set(2.4, 3.4, 2.2);
  scene.add(key);

  const rim = new THREE.DirectionalLight('#7ea6cc', 1.7);
  rim.position.set(-2.8, 1.2, -2.4);
  scene.add(rim);

  scene.add(new THREE.AmbientLight('#4a4436', 0.5));

  const group = new THREE.Group();
  scene.add(group);

  const gold = new THREE.MeshPhysicalMaterial({
    color: '#b8923f',
    metalness: 1.0,
    roughness: 0.36,
    clearcoat: 0.18,
    clearcoatRoughness: 0.55,
    reflectivity: 0.85,
  });

  const ingot = new THREE.Mesh(makeIngotGeometry(), gold);
  group.add(ingot);

  // the struck face
  const stamp = new THREE.Mesh(
    new THREE.PlaneGeometry(1.42, 0.78),
    new THREE.MeshBasicMaterial({
      map: makeStampTexture(),
      transparent: true,
      opacity: 0.20,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  stamp.rotation.x = -Math.PI / 2;
  stamp.position.y = 0.368;
  group.add(stamp);

  // a faint plinth glow under the bar
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 48),
    new THREE.MeshBasicMaterial({
      color: '#c8a24c',
      transparent: true,
      opacity: 0.055,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -0.62;
  scene.add(halo);

  /* ---- interaction ---- */
  const drag = { active: false, lastX: 0, lastY: 0, vx: 0, vy: 0 };
  let rotY = -0.55;
  let rotX = 0.16;
  let idle = 0;

  const onDown = (e) => {
    drag.active = true;
    const p = e.touches ? e.touches[0] : e;
    drag.lastX = p.clientX;
    drag.lastY = p.clientY;
    container.classList.add('is-dragging');
  };
  const onMove = (e) => {
    if (!drag.active) return;
    const p = e.touches ? e.touches[0] : e;
    drag.vx = (p.clientX - drag.lastX) * 0.0075;
    drag.vy = (p.clientY - drag.lastY) * 0.005;
    rotY += drag.vx;
    rotX = THREE.MathUtils.clamp(rotX + drag.vy, -0.62, 0.72);
    drag.lastX = p.clientX;
    drag.lastY = p.clientY;
    if (e.cancelable) e.preventDefault();
  };
  const onUp = () => {
    drag.active = false;
    container.classList.remove('is-dragging');
  };

  container.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  container.addEventListener('touchstart', onDown, { passive: true });
  window.addEventListener('touchmove', onMove, { passive: false });
  window.addEventListener('touchend', onUp);

  function resize() {
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  let visible = true;
  const io = new IntersectionObserver(
    ([entry]) => { visible = entry.isIntersecting; if (visible) resize(); },
    { rootMargin: '200px' },
  );
  io.observe(container);

  const clock = new THREE.Clock();
  function frame() {
    requestAnimationFrame(frame);
    if (!visible) return;

    const dt = Math.min(clock.getDelta(), 0.05);
    idle += dt;

    if (!drag.active) {
      // momentum, then a slow return to the idle turn
      drag.vx *= 0.94;
      drag.vy *= 0.94;
      rotY += drag.vx + (reducedMotion ? 0 : dt * 0.11);
      rotX += drag.vy;
      rotX += (0.16 - rotX) * dt * 0.6;
    }

    group.rotation.y = rotY;
    group.rotation.x = rotX;
    group.position.y = reducedMotion ? 0 : Math.sin(idle * 0.7) * 0.045;

    renderer.render(scene, camera);
  }
  frame();

  return { renderer, scene, camera, group, resize };
}
