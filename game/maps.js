// Map construction. Each builder returns visuals, feeds matching primitive
// colliders into the ColliderWorld, and lists interactables (computer /
// inventory stand / shop) plus a spawn point. Visuals and colliders are added
// together through MapBuilder so climbing lines up with what you see.

import * as THREE from "three";

class MapBuilder {
  constructor(scene, world) {
    this.scene = scene;
    this.world = world;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.interactables = [];
    this._materials = [];
  }

  mat(color, opts = {}) {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.roughness ?? 0.85,
      metalness: opts.metalness ?? 0.0,
      flatShading: opts.flat ?? false,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: opts.transparent ?? false,
      opacity: opts.opacity ?? 1,
      side: opts.side ?? THREE.FrontSide,
    });
    this._materials.push(m);
    return m;
  }

  ground(height, material, size = 200) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = height;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.world.addGround(height);
    return mesh;
  }

  box(cx, cy, cz, hx, hy, hz, material, { collide = true, quat = null, receive = true } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hy * 2, hz * 2), material);
    mesh.position.set(cx, cy, cz);
    if (quat) mesh.quaternion.copy(quat);
    mesh.castShadow = true;
    mesh.receiveShadow = receive;
    this.group.add(mesh);
    if (collide) this.world.addBox(cx, cy, cz, hx, hy, hz, quat);
    return mesh;
  }

  sphere(cx, cy, cz, r, material, { collide = true, scale = null } = {}) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), material);
    mesh.position.set(cx, cy, cz);
    if (scale) mesh.scale.copy(scale);
    mesh.castShadow = true;
    this.group.add(mesh);
    if (collide) this.world.addSphere(cx, cy, cz, r);
    return mesh;
  }

  // base-centred vertical cylinder (bottom at cy)
  cylinder(cx, cy, cz, rTop, rBot, h, material, { collide = true, colR = null } = {}) {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(rTop, rBot, h, 16),
      material
    );
    mesh.position.set(cx, cy + h / 2, cz);
    mesh.castShadow = true;
    this.group.add(mesh);
    if (collide) this.world.addCylinder(cx, cy, cz, colR ?? (rTop + rBot) / 2, h);
    return mesh;
  }

  cone(cx, cy, cz, r, h, material, { collide = true } = {}) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, 14), material);
    mesh.position.set(cx, cy + h / 2, cz);
    mesh.castShadow = true;
    this.group.add(mesh);
    if (collide) this.world.addCylinder(cx, cy, cz, r * 0.6, h); // approx
    return mesh;
  }

  addInteractable(type, x, y, z, radius, extra = {}) {
    const mount = new THREE.Group();
    mount.position.set(x, y, z);
    this.group.add(mount);
    const it = { type, position: new THREE.Vector3(x, y, z), radius, mount, ...extra };
    this.interactables.push(it);
    return it;
  }
}

// --- Shared props -----------------------------------------------------------

function addTree(b, x, z, scale = 1) {
  const trunkMat = b.mat(0x6b4a2b, { roughness: 1 });
  const leafMat = b.mat(0x3f8a3a, { roughness: 0.9, flat: true });
  const h = 3.2 * scale;
  b.cylinder(x, 0, z, 0.22 * scale, 0.32 * scale, h, trunkMat, {
    colR: 0.3 * scale,
  });
  // climbable canopy: a few overlapping leaf blobs (sphere colliders)
  const top = h;
  b.sphere(x, top, z, 1.0 * scale, leafMat);
  b.sphere(x - 0.7 * scale, top - 0.3 * scale, z + 0.3 * scale, 0.75 * scale, leafMat);
  b.sphere(x + 0.6 * scale, top - 0.2 * scale, z - 0.4 * scale, 0.7 * scale, leafMat);
  b.sphere(x + 0.1 * scale, top + 0.6 * scale, z + 0.1 * scale, 0.7 * scale, leafMat);
}

function addRock(b, x, z, r, colorMat) {
  const s = new THREE.Vector3(1, 0.75, 1.05);
  b.sphere(x, r * 0.4, z, r, colorMat, { scale: s });
}

function addGrassPatch(b, cx, cz, count, radius) {
  // Instanced grass blades — visual only, no colliders.
  const bladeMat = b.mat(0x5fae3d, { roughness: 1, side: THREE.DoubleSide });
  const geo = new THREE.PlaneGeometry(0.06, 0.28);
  geo.translate(0, 0.14, 0);
  const inst = new THREE.InstancedMesh(geo, bladeMat, count);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3(1, 1, 1);
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(Math.random()) * radius;
    p.set(cx + Math.cos(a) * rr, 0, cz + Math.sin(a) * rr);
    q.setFromAxisAngle(_up, Math.random() * Math.PI);
    const sc = 0.7 + Math.random() * 0.7;
    s.set(sc, sc, sc);
    m.compose(p, q, s);
    inst.setMatrixAt(i, m);
  }
  inst.instanceMatrix.needsUpdate = true;
  b.group.add(inst);
}

function addFlowers(b, count, rand, rMin = 4, rMax = 30) {
  const stemMat = b.mat(0x3f7a2e, { roughness: 1 });
  const petals = [0xff6fae, 0xffd24a, 0xff8c42, 0xc17ce8, 0xffffff];
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2;
    const d = rMin + rand() * (rMax - rMin);
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = 0.18 + rand() * 0.15;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, h, 5), stemMat);
    stem.position.set(x, h / 2, z);
    b.group.add(stem);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.035 + rand() * 0.02, 8, 6),
      b.mat(petals[Math.floor(rand() * petals.length)], { roughness: 0.7 })
    );
    head.position.set(x, h + 0.02, z);
    head.scale.y = 0.7;
    b.group.add(head);
  }
}

function addMushrooms(b, positions) {
  const stemMat = b.mat(0xe8e0d0, { roughness: 0.9 });
  const capMat = b.mat(0xc94436, { roughness: 0.7 });
  const dotMat = b.mat(0xffffff, { roughness: 0.7 });
  for (const [x, z, s] of positions) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * s, 0.07 * s, 0.22 * s, 8), stemMat);
    stem.position.set(x, 0.11 * s, z);
    stem.castShadow = true;
    b.group.add(stem);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.14 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
      capMat
    );
    cap.position.set(x, 0.2 * s, z);
    cap.castShadow = true;
    b.group.add(cap);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.5;
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.02 * s, 6, 6), dotMat);
      dot.position.set(x + Math.cos(a) * 0.08 * s, 0.27 * s, z + Math.sin(a) * 0.08 * s);
      b.group.add(dot);
    }
  }
}

function addClouds(b, rand) {
  const cloudMat = b.mat(0xffffff, { roughness: 1, transparent: true, opacity: 0.92 });
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    const d = 20 + rand() * 45;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const y = 24 + rand() * 12;
    for (let k = 0; k < 3; k++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(2.2 + rand() * 1.8, 10, 8), cloudMat);
      puff.position.set(x + (rand() - 0.5) * 5, y + (rand() - 0.5) * 1.2, z + (rand() - 0.5) * 4);
      puff.scale.y = 0.5;
      b.group.add(puff);
    }
  }
}

function addDirtPath(b, from, to, steps = 7) {
  const dirtMat = b.mat(0x8a6a42, { roughness: 1 });
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = from[0] + (to[0] - from[0]) * t + Math.sin(i * 2.1) * 0.5;
    const z = from[1] + (to[1] - from[1]) * t + Math.cos(i * 1.7) * 0.5;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.8 + (i % 2) * 0.25, 12), dirtMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(x, 0.012 + i * 0.0004, z);
    disc.receiveShadow = true;
    b.group.add(disc);
  }
}

function addGazebo(b, cx, cz) {
  const postMat = b.mat(0xcaa46a, { roughness: 0.8 });
  const roofMat = b.mat(0x8a4b2a, { roughness: 0.8, flat: true });
  const floorMat = b.mat(0xb9915a, { roughness: 0.9 });
  const R = 2.4;
  // floor
  b.cylinder(cx, 0.0, cz, R, R, 0.15, floorMat, { colR: R });
  // posts
  const posts = 6;
  for (let i = 0; i < posts; i++) {
    const a = (i / posts) * Math.PI * 2;
    const px = cx + Math.cos(a) * (R - 0.3);
    const pz = cz + Math.sin(a) * (R - 0.3);
    b.cylinder(px, 0.15, pz, 0.09, 0.09, 2.4, postMat, { colR: 0.12 });
  }
  // conical roof
  b.cone(cx, 2.55, cz, R + 0.2, 1.3, roofMat, { collide: true });
  // a little finial
  b.sphere(cx, 3.95, cz, 0.14, roofMat, { collide: false });
}

// Hollow spawn stump made from a ring of wall boxes with a doorway gap.
function addStump(b, cx, cz, { computer = true, inventory = true } = {}) {
  const barkMat = b.mat(0x7a5230, { roughness: 1, flat: true });
  const innerMat = b.mat(0xa9885b, { roughness: 1 });
  const R = 3.2;
  const wallH = 2.0;
  const segs = 18;
  const doorFrom = 8;
  const doorTo = 10; // skip these segments for an entrance
  for (let i = 0; i < segs; i++) {
    if (i >= doorFrom && i <= doorTo) continue;
    const a = (i / segs) * Math.PI * 2;
    const px = cx + Math.cos(a) * R;
    const pz = cz + Math.sin(a) * R;
    const q = new THREE.Quaternion().setFromAxisAngle(_up, -a);
    // segment thickness/width to form a ring
    const segW = (Math.PI * 2 * R) / segs / 2 + 0.06;
    b.box(px, wallH / 2, pz, 0.35, wallH / 2, segW, barkMat, { quat: q });
  }
  // rim cap (climbable top) — ring of small boxes
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const px = cx + Math.cos(a) * R;
    const pz = cz + Math.sin(a) * R;
    const q = new THREE.Quaternion().setFromAxisAngle(_up, -a);
    const segW = (Math.PI * 2 * R) / segs / 2 + 0.06;
    b.box(px, wallH + 0.12, pz, 0.45, 0.12, segW, innerMat, { quat: q });
  }
  // roots outside
  const rootMat = b.mat(0x5f4020, { roughness: 1, flat: true });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    addRock(b, cx + Math.cos(a) * (R + 0.6), cz + Math.sin(a) * (R + 0.6), 0.5, rootMat);
  }

  if (computer) {
    const it = b.addInteractable("computer", cx - 1.4, 0, cz - 1.4, 1.6);
    buildComputerBody(b, it, cx - 1.4, cz - 1.4, Math.PI * 0.25);
  }
  if (inventory) {
    const it = b.addInteractable("inventory", cx + 1.5, 0, cz - 1.2, 1.6);
    buildInventoryStand(b, it, cx + 1.5, cz - 1.2, -Math.PI * 0.25);
  }
}

// A retro computer terminal like the one in the spawn stump.
function buildComputerBody(b, interactable, x, z, faceAngle) {
  const caseMat = b.mat(0xd9d2c0, { roughness: 0.6 });
  const darkMat = b.mat(0x2a2a2a, { roughness: 0.5 });
  const q = new THREE.Quaternion().setFromAxisAngle(_up, faceAngle);
  // desk
  b.box(x, 0.5, z, 0.7, 0.05, 0.45, b.mat(0x8a5a34), { quat: q });
  b.box(x, 0.25, z, 0.06, 0.25, 0.06, darkMat, { quat: q, collide: false });
  // monitor case
  const mon = new THREE.Group();
  mon.position.set(x, 1.15, z);
  mon.quaternion.copy(q);
  b.group.add(mon);
  const caseMesh = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 0.5), caseMat);
  caseMesh.castShadow = true;
  mon.add(caseMesh);
  // The screen mount faces +Z of the monitor.
  interactable.mount.position.set(x, 1.2, z);
  interactable.mount.quaternion.copy(q);
  interactable.mount.translateZ(0.26);
  interactable.screenSize = { w: 0.72, h: 0.56 };
  // keyboard slab
  b.box(x, 0.56, z, 0.4, 0.03, 0.18, darkMat, { quat: q, collide: false });
}

function buildInventoryStand(b, interactable, x, z, faceAngle) {
  const woodMat = b.mat(0x7a4f2a, { roughness: 0.9 });
  const q = new THREE.Quaternion().setFromAxisAngle(_up, faceAngle);
  b.cylinder(x, 0, z, 0.28, 0.34, 1.0, woodMat, { colR: 0.34 });
  // Sign board that the inventory panel mounts onto.
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(1.0, 0.8, 0.06),
    b.mat(0x5a3a1e, { roughness: 0.9 })
  );
  board.position.set(x, 1.55, z);
  board.quaternion.copy(q);
  board.castShadow = true;
  b.group.add(board);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.7, 0.08), woodMat);
  post.position.set(x, 1.15, z);
  b.group.add(post);
  interactable.mount.position.set(x, 1.55, z);
  interactable.mount.quaternion.copy(q);
  interactable.mount.translateZ(0.05);
  interactable.screenSize = { w: 0.92, h: 0.72 };
}

function buildShopKiosk(b, x, z, faceAngle, label) {
  const woodMat = b.mat(0x6b4a2b, { roughness: 0.9 });
  const awningMat = b.mat(0xd94f4f, { roughness: 0.8, flat: true });
  const q = new THREE.Quaternion().setFromAxisAngle(_up, faceAngle);
  // counter
  b.box(x, 0.55, z, 0.9, 0.55, 0.5, woodMat, { quat: q });
  // back panel
  b.box(x, 1.4, z, 0.9, 0.9, 0.08, b.mat(0xe8d9b5), {
    quat: q,
    collide: false,
  });
  // posts + awning
  b.box(x, 2.3, z, 1.0, 0.06, 0.7, awningMat, { quat: q, collide: false });
  const it = b.addInteractable("shop", x, 0, z, 2.0, { label });
  it.mount.position.set(x, 1.4, z);
  it.mount.quaternion.copy(q);
  it.mount.translateZ(0.1);
  it.screenSize = { w: 0.82, h: 0.82 };
  return it;
}

// --- Map: Forest ------------------------------------------------------------

function buildForest(scene, world) {
  const b = new MapBuilder(scene, world);
  scene.background = new THREE.Color(0x9fd3ff);
  scene.fog = new THREE.Fog(0x9fd3ff, 30, 120);

  const groundMat = b.mat(0x4f8f3a, { roughness: 1 });
  b.ground(0, groundMat);

  // Spawn stump at origin with computer + inventory inside.
  addStump(b, 0, 0, { computer: true, inventory: true });

  // Ring of trees + rocks + grass around the clearing.
  const rand = mulberry32(1234);
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2;
    const d = 8 + rand() * 42;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (Math.hypot(x, z) < 6) continue;
    addTree(b, x, z, 0.8 + rand() * 0.9);
  }
  const rockMat = b.mat(0x8a8f95, { roughness: 1, flat: true });
  for (let i = 0; i < 18; i++) {
    const a = rand() * Math.PI * 2;
    const d = 6 + rand() * 40;
    addRock(b, Math.cos(a) * d, Math.sin(a) * d, 0.4 + rand() * 1.2, rockMat);
  }
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    const d = 5 + rand() * 30;
    addGrassPatch(b, Math.cos(a) * d, Math.sin(a) * d, 40, 2.2);
  }

  // Gazebo on the doorway side of the stump (door faces -X), linked by a path.
  addGazebo(b, -11, -3);
  addDirtPath(b, [-4, 0], [-9, -2.5]);

  // A couple of big climbable boulders as a play structure.
  addRock(b, -10, 8, 2.2, rockMat);
  addRock(b, -12.5, 7, 1.6, rockMat);
  addRock(b, -8.5, 10, 1.8, rockMat);

  // Set dressing: flowers everywhere, mushrooms by the stump, drifting clouds.
  addFlowers(b, 40, rand);
  addMushrooms(b, [
    [4.2, 1.5, 1],
    [4.8, 0.6, 0.7],
    [-2.5, 4.6, 1.2],
    [1.8, -4.4, 0.8],
    [-4.6, -1.8, 1],
  ]);
  addClouds(b, rand);

  return {
    group: b.group,
    world,
    spawn: new THREE.Vector3(0, 0, 1.2),
    interactables: b.interactables,
    ambient: 0x88aacc,
    sun: 0xffffff,
  };
}

// --- Map: Caves -------------------------------------------------------------

function buildCaves(scene, world) {
  const b = new MapBuilder(scene, world);
  scene.background = new THREE.Color(0x0a0d12);
  scene.fog = new THREE.Fog(0x0a0d12, 8, 48);

  const floorMat = b.mat(0x2a2622, { roughness: 1, flat: true });
  b.ground(0, floorMat);

  const rockMat = b.mat(0x3b3630, { roughness: 1, flat: true });
  const crystalMat = b.mat(0x4fd9ff, {
    roughness: 0.2,
    emissive: 0x2f9cc4,
    emissiveIntensity: 2.2,
  });

  // Surrounding cave wall from big overlapping rock spheres.
  const rand = mulberry32(99);
  const R = 24;
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const rr = R + rand() * 3;
    const x = Math.cos(a) * rr;
    const z = Math.sin(a) * rr;
    const size = 4 + rand() * 3;
    b.sphere(x, rand() * 2, z, size, rockMat);
    b.sphere(x, 4 + rand() * 3, z, size * 0.8, rockMat);
  }

  // Climbable stalagmites + boulders in the interior.
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * 16;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (Math.hypot(x, z) < 3) continue;
    const h = 2 + rand() * 4;
    b.cone(x, 0, z, 0.8 + rand(), h, rockMat);
    if (rand() > 0.6) {
      const cy = h * 0.7;
      const c = b.sphere(x, cy, z, 0.35, crystalMat, { collide: false });
      c.scale.set(0.6, 1.6, 0.6);
    }
  }
  // Hanging stalactites (visual + collider from ceiling).
  for (let i = 0; i < 10; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * 14;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = 2 + rand() * 3;
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.6, h, 12),
      rockMat
    );
    cone.position.set(x, 14 - h / 2, z);
    cone.rotation.x = Math.PI;
    cone.castShadow = true;
    b.group.add(cone);
  }

  // Glowing crystal clusters as landmarks.
  for (let i = 0; i < 6; i++) {
    const a = rand() * Math.PI * 2;
    const d = 6 + rand() * 12;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    for (let k = 0; k < 4; k++) {
      const c = b.sphere(
        x + (rand() - 0.5),
        0.4 + rand(),
        z + (rand() - 0.5),
        0.25 + rand() * 0.3,
        crystalMat,
        { collide: false }
      );
      c.scale.set(0.5, 1.8, 0.5);
    }
  }

  // Mood lighting: a cool wash from above and warm pockets to explore toward.
  const caveLight = new THREE.PointLight(0x77c4ff, 90, 70, 1.4);
  caveLight.position.set(0, 9, 0);
  b.group.add(caveLight);
  const warmLight = new THREE.PointLight(0xffaa55, 50, 40, 1.4);
  warmLight.position.set(9, 3, -7);
  b.group.add(warmLight);
  const warmLight2 = new THREE.PointLight(0xff9966, 40, 36, 1.4);
  warmLight2.position.set(-10, 4, 6);
  b.group.add(warmLight2);

  // Terminal near the spawn so you can always travel out / tweak settings.
  const term = b.addInteractable("computer", 2.4, 0, 2.4, 1.6);
  buildComputerBody(b, term, 2.4, 2.4, -Math.PI * 0.75);

  return {
    group: b.group,
    world,
    spawn: new THREE.Vector3(0, 0, 0),
    interactables: b.interactables,
    ambient: 0x223344,
    sun: 0x9fd0ff,
    dark: true,
  };
}

// --- Map: City --------------------------------------------------------------

function buildCity(scene, world) {
  const b = new MapBuilder(scene, world);
  scene.background = new THREE.Color(0xbcd0e6);
  scene.fog = new THREE.Fog(0xbcd0e6, 40, 160);

  const roadMat = b.mat(0x3c4048, { roughness: 1 });
  b.ground(0, roadMat);

  // Plaza tiles.
  const tileMat = b.mat(0x6d7681, { roughness: 0.9 });
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = -3; gz <= 3; gz++) {
      const t = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 3.8), tileMat);
      t.rotation.x = -Math.PI / 2;
      t.position.set(gx * 4, 0.01, gz * 4);
      t.receiveShadow = true;
      b.group.add(t);
    }
  }

  // Surrounding buildings (box colliders, varied heights/colours).
  const palette = [0x9aa7b4, 0xc7b299, 0x8f9bb0, 0xb08f8f, 0x88a58f];
  const rand = mulberry32(7);
  const placeBuilding = (x, z, w, d, h, colorIdx) => {
    const m = b.mat(palette[colorIdx % palette.length], { roughness: 0.9 });
    b.box(x, h / 2, z, w / 2, h / 2, d / 2, m);
    // windows strip (emissive, no collide)
    const winMat = b.mat(0x223, {
      emissive: 0xffe9a8,
      emissiveIntensity: 0.5,
      roughness: 0.3,
    });
    for (let wy = 1.5; wy < h - 1; wy += 2) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.6, 0.05), winMat);
      strip.position.set(x, wy, z + d / 2 + 0.02);
      b.group.add(strip);
      const strip2 = strip.clone();
      strip2.position.z = z - d / 2 - 0.02;
      b.group.add(strip2);
    }
  };
  const ring = [
    [-22, -18, 8, 10, 16],
    [-24, 6, 9, 9, 22],
    [-10, 24, 12, 8, 14],
    [12, 24, 10, 9, 26],
    [26, 8, 9, 12, 20],
    [24, -14, 10, 10, 18],
    [6, -26, 12, 8, 24],
    [-8, -26, 9, 8, 12],
  ];
  ring.forEach((r, i) => placeBuilding(r[0], r[1], r[2], r[3], r[4], i));

  // Streetlamps.
  const lampMat = b.mat(0x2c2c2c, { roughness: 0.6 });
  const bulbMat = b.mat(0xfff2c0, { emissive: 0xffe9a8, emissiveIntensity: 1.2 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 13;
    const z = Math.sin(a) * 13;
    b.cylinder(x, 0, z, 0.08, 0.1, 3, lampMat, { colR: 0.12 });
    b.sphere(x, 3.1, z, 0.16, bulbMat, { collide: false });
  }

  // Central fountain (climbable).
  const stoneMat = b.mat(0x9199a1, { roughness: 0.9 });
  b.cylinder(0, 0, 0, 1.8, 2.0, 0.6, stoneMat, { colR: 2.0 });
  b.cylinder(0, 0.6, 0, 0.4, 0.5, 1.2, stoneMat, { colR: 0.5 });
  b.sphere(0, 1.9, 0, 0.3, b.mat(0x4fb0d9, { roughness: 0.3 }), { collide: false });

  // Inventory stand near the plaza edge.
  const invIt = b.addInteractable("inventory", -4, 0, 6, 1.6);
  buildInventoryStand(b, invIt, -4, 6, Math.PI);

  // Two shops that sell cosmetics.
  buildShopKiosk(b, 6, 6, Math.PI, "Hat Shack");
  buildShopKiosk(b, 8, -4, Math.PI * 0.75, "Trinket Cart");

  // City terminal so you can travel / change settings without going home.
  const term = b.addInteractable("computer", -7, 0, -3, 1.6);
  buildComputerBody(b, term, -7, -3, Math.PI * 0.35);

  // Some benches / crates as decoration + play props.
  const crateMat = b.mat(0x9c7a4a, { roughness: 0.9, flat: true });
  for (let i = 0; i < 6; i++) {
    const x = -6 + rand() * 12;
    const z = -8 + rand() * 4;
    const s = 0.4 + rand() * 0.3;
    b.box(x, s, z, s, s, s, crateMat);
  }

  // Crosswalk stripes on the ring road + planter trees around the plaza.
  const stripeMat = b.mat(0xe8e8e8, { roughness: 0.8 });
  for (let i = 0; i < 6; i++) {
    for (const [sx, sz, rot] of [
      [16, -3 + i, 0],
      [-16, -3 + i, 0],
      [-3 + i, 16, Math.PI / 2],
      [-3 + i, -16, Math.PI / 2],
    ]) {
      const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.45), stripeMat);
      stripe.rotation.x = -Math.PI / 2;
      stripe.rotation.z = rot;
      stripe.position.set(sx, 0.015, sz);
      b.group.add(stripe);
    }
  }
  addTree(b, 13, 13, 0.9);
  addTree(b, -13, 13, 1.0);
  addTree(b, 13, -13, 0.85);
  addTree(b, -13, -13, 0.95);

  return {
    group: b.group,
    world,
    spawn: new THREE.Vector3(0, 0, 6),
    interactables: b.interactables,
    ambient: 0x93a7bd,
    sun: 0xffffff,
  };
}

export function buildMap(name, scene, world) {
  world.clear();
  switch (name) {
    case "caves":
      return buildCaves(scene, world);
    case "city":
      return buildCity(scene, world);
    case "forest":
    default:
      return buildForest(scene, world);
  }
}

// deterministic PRNG so maps look the same for everyone in a room
function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const _up = new THREE.Vector3(0, 1, 0);
