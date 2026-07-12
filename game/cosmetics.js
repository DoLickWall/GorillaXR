// Cosmetic catalog. Every item is built from primitive geometry (no external
// asset files) and knows which avatar anchor it attaches to. Anchors are empty
// Object3Ds on the avatar: "hat", "face", "earL", "earR", "torso", "handR".

import * as THREE from "three";

// slot decides mutual exclusion when equipping (one hat at a time, etc.)
export const COSMETICS = [
  { id: "banana_hat", name: "Banana Hat", price: 120, slot: "hat", anchor: "hat" },
  { id: "beanie", name: "Beanie", price: 90, slot: "hat", anchor: "hat" },
  { id: "coconut_hat", name: "Coconut Hat", price: 140, slot: "hat", anchor: "hat" },
  { id: "glasses", name: "Glasses", price: 80, slot: "face", anchor: "face" },
  { id: "earrings", name: "Earrings", price: 110, slot: "ears", anchor: "ears" },
  { id: "shirt_webxr", name: '"I ♥ WebXR" Shirt', price: 100, slot: "torso", anchor: "torso" },
  {
    id: "stick",
    name: "The Stick",
    price: 0,
    slot: "hand",
    anchor: "handR",
    modOnly: true,
  },
];

export const COSMETIC_BY_ID = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

// --- Builders ---------------------------------------------------------------

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: opts.roughness ?? 0.7,
    metalness: opts.metalness ?? 0.0,
    ...opts,
  });
}

function buildBananaHat() {
  const g = new THREE.Group();
  // Curved banana from a partial torus.
  const banana = new THREE.Mesh(
    new THREE.TorusGeometry(0.11, 0.032, 12, 24, Math.PI * 1.15),
    mat(0xffd23f, { roughness: 0.5 })
  );
  banana.rotation.z = Math.PI * 0.5;
  banana.rotation.x = Math.PI * 0.5;
  banana.position.y = 0.12;
  g.add(banana);
  // little brown tips
  const tipMat = mat(0x5a3d1a);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.05, 8), tipMat);
    tip.position.set(s * 0.115, 0.12, 0);
    tip.rotation.z = s * Math.PI * 0.5;
    g.add(tip);
  }
  return g;
}

function buildBeanie() {
  const g = new THREE.Group();
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.135, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.62),
    mat(0xd94f4f, { roughness: 0.9 })
  );
  cap.position.y = 0.05;
  g.add(cap);
  const brim = new THREE.Mesh(
    new THREE.TorusGeometry(0.132, 0.028, 10, 24),
    mat(0xb03636, { roughness: 0.9 })
  );
  brim.rotation.x = Math.PI / 2;
  brim.position.y = 0.075;
  g.add(brim);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 12), mat(0xffffff));
  pom.position.y = 0.2;
  g.add(pom);
  return g;
}

function buildCoconutHat() {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
    mat(0x6b4423, { roughness: 0.95 })
  );
  shell.position.y = 0.06;
  g.add(shell);
  // fibrous rim
  const rim = new THREE.Mesh(
    new THREE.TorusGeometry(0.125, 0.02, 8, 20),
    mat(0x4a2f18, { roughness: 1 })
  );
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.07;
  g.add(rim);
  // three "eyes"
  const dot = mat(0x2a1a0e);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const e = new THREE.Mesh(new THREE.CircleGeometry(0.014, 10), dot);
    e.position.set(Math.cos(a) * 0.07, 0.11, Math.sin(a) * 0.07);
    e.lookAt(e.position.clone().multiplyScalar(2).setY(0.3));
    g.add(e);
  }
  return g;
}

function buildGlasses() {
  const g = new THREE.Group();
  const frameMat = mat(0x111111, { roughness: 0.4, metalness: 0.3 });
  const lensMat = new THREE.MeshStandardMaterial({
    color: 0x224466,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.55,
  });
  for (const s of [-1, 1]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 8, 20), frameMat);
    ring.position.set(s * 0.05, 0, 0);
    g.add(ring);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.038, 20), lensMat);
    lens.position.set(s * 0.05, 0, 0.002);
    g.add(lens);
  }
  const bridge = new THREE.Mesh(
    new THREE.CylinderGeometry(0.005, 0.005, 0.03, 8),
    frameMat
  );
  bridge.rotation.z = Math.PI / 2;
  g.add(bridge);
  g.position.z = 0.09; // sit in front of the face
  return g;
}

function buildEarrings() {
  // Returns a group with two children pre-positioned; the avatar attaches this
  // to a central point and the studs reach each ear.
  const g = new THREE.Group();
  const gold = mat(0xffd24a, { metalness: 0.8, roughness: 0.25 });
  for (const s of [-1, 1]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.006, 8, 18), gold);
    hoop.position.set(s * 0.135, -0.02, 0);
    hoop.rotation.y = Math.PI / 2;
    g.add(hoop);
    const gem = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.012),
      mat(0x4fd9ff, { metalness: 0.4, roughness: 0.2 })
    );
    gem.position.set(s * 0.135, -0.045, 0);
    g.add(gem);
  }
  return g;
}

let _shirtTexture = null;
function shirtTexture() {
  if (_shirtTexture) return _shirtTexture;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 512;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#f4f4f4";
  ctx.fillRect(0, 0, 512, 512);
  ctx.fillStyle = "#1b1b1b";
  ctx.font = "bold 70px Segoe UI, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("I", 256, 250);
  ctx.fillStyle = "#e23b52";
  ctx.font = "bold 78px Segoe UI, Arial";
  ctx.fillText("♥", 256, 300);
  ctx.fillStyle = "#1b1b1b";
  ctx.font = "bold 64px Segoe UI, Arial";
  ctx.fillText("WebXR", 256, 380);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  _shirtTexture = tex;
  return tex;
}

function buildShirt() {
  const g = new THREE.Group();
  // A slightly larger torso shell that wraps the body sphere.
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.24, 0.42, 24, 1, true),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      side: THREE.DoubleSide,
    })
  );
  g.add(body);
  // Front print.
  const print = new THREE.Mesh(
    new THREE.PlaneGeometry(0.26, 0.26),
    new THREE.MeshStandardMaterial({
      map: shirtTexture(),
      roughness: 0.85,
      transparent: true,
    })
  );
  print.position.set(0, 0.02, 0.255);
  g.add(print);
  return g;
}

function buildStick() {
  const g = new THREE.Group();
  const woodMat = mat(0x6e4a24, { roughness: 1 });
  const stick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.024, 0.6, 10),
    woodMat
  );
  stick.rotation.z = Math.PI / 2;
  stick.position.x = 0.18;
  g.add(stick);
  // a couple of knots/twigs
  const twig = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.09, 6), woodMat);
  twig.position.set(0.32, 0.03, 0);
  twig.rotation.z = Math.PI / 3;
  g.add(twig);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.02, 10, 10),
    new THREE.MeshStandardMaterial({ color: 0x7dd66d, emissive: 0x2f6a26, emissiveIntensity: 1 })
  );
  glow.position.x = 0.47;
  g.add(glow);
  return g;
}

const BUILDERS = {
  banana_hat: buildBananaHat,
  beanie: buildBeanie,
  coconut_hat: buildCoconutHat,
  glasses: buildGlasses,
  earrings: buildEarrings,
  shirt_webxr: buildShirt,
  stick: buildStick,
};

export function buildCosmetic(id) {
  const fn = BUILDERS[id];
  if (!fn) return null;
  const obj = fn();
  obj.userData.cosmeticId = id;
  obj.traverse((o) => {
    o.castShadow = true;
  });
  return obj;
}
