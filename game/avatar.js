// Avatar: a clean, low-poly gorilla built entirely from primitives. Shared by
// the local player and every networked remote so they look identical.
//
// Features:
//   - articulated hands with five fingers driven by trigger/grip/thumb
//   - stretchy arms that connect the torso to the hands (Gorilla-Tag style)
//   - cosmetic anchors (hat / face / ears / torso / hand)
//   - floating name tag
//   - single-colour tint you can change at runtime

import * as THREE from "three";
import { buildCosmetic, COSMETIC_BY_ID } from "./cosmetics.js";

const SKIN_ROUGH = 0.75;

function skinMat(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: SKIN_ROUGH, metalness: 0.02 });
}

// ---- Hand (with articulated fingers) --------------------------------------

class Hand {
  constructor(color, isLeft) {
    this.isLeft = isLeft;
    this.group = new THREE.Group();
    this.material = skinMat(color);

    // Palm — a rounded slab.
    const palm = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.03, 0.09), this.material);
    palm.geometry.translate(0, 0, -0.01);
    this.group.add(palm);
    const knuckle = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 12, 10),
      this.material
    );
    knuckle.scale.set(1, 0.55, 1.05);
    knuckle.position.z = 0.02;
    this.group.add(knuckle);

    this.fingers = {};
    // Four fingers along the front edge.
    const names = ["index", "middle", "ring", "pinky"];
    const xs = [-0.03, -0.01, 0.012, 0.032];
    const lens = [0.05, 0.055, 0.05, 0.04];
    for (let i = 0; i < names.length; i++) {
      const f = this._buildFinger(lens[i]);
      f.pivot.position.set(this.isLeft ? -xs[i] : xs[i], 0, 0.05);
      this.group.add(f.pivot);
      this.fingers[names[i]] = f;
    }
    // Thumb — offset to the side, angled.
    const thumb = this._buildFinger(0.045);
    thumb.pivot.position.set(this.isLeft ? 0.045 : -0.045, 0, 0.0);
    thumb.pivot.rotation.z = this.isLeft ? -0.9 : 0.9;
    thumb.pivot.rotation.y = this.isLeft ? -0.5 : 0.5;
    this.group.add(thumb.pivot);
    this.fingers.thumb = thumb;
    // Runtime pose sets the world orientation; the base grip->model rotation is
    // applied in Avatar._applyHand so it stays in sync with the controller.
  }

  _buildFinger(length) {
    const pivot = new THREE.Group();
    const seg1 = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.012, length * 0.5, 4, 8),
      this.material
    );
    seg1.rotation.x = Math.PI / 2;
    seg1.position.z = length * 0.35;
    pivot.add(seg1);
    const midPivot = new THREE.Group();
    midPivot.position.z = length * 0.7;
    pivot.add(midPivot);
    const seg2 = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.01, length * 0.4, 4, 8),
      this.material
    );
    seg2.rotation.x = Math.PI / 2;
    seg2.position.z = length * 0.3;
    midPivot.add(seg2);
    return { pivot, midPivot, length };
  }

  /** curl values in 0..1: index<-trigger, mid/ring/pinky<-grip, thumb<-thumb */
  setFingers(trigger, grip, thumb) {
    const curl = (f, amount) => {
      const a = amount * 1.4;
      f.pivot.rotation.x = a;
      f.midPivot.rotation.x = a * 0.9;
    };
    curl(this.fingers.index, trigger);
    curl(this.fingers.middle, grip);
    curl(this.fingers.ring, grip);
    curl(this.fingers.pinky, grip);
    // Thumb curls inward toward the palm.
    const t = thumb * 1.1;
    this.fingers.thumb.pivot.rotation.x = t;
    this.fingers.thumb.midPivot.rotation.x = t * 0.8;
  }

  setColor(color) {
    this.material.color.setHex(color);
  }
}

// ---- Name tag sprite -------------------------------------------------------

function makeNameTag(text, infected) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 256, 72);
  ctx.fillStyle = infected ? "rgba(120,20,20,0.82)" : "rgba(12,25,16,0.78)";
  roundRect(ctx, 6, 8, 244, 56, 16);
  ctx.fill();
  ctx.strokeStyle = infected ? "#ff6b5e" : "#7dd66d";
  ctx.lineWidth = 3;
  roundRect(ctx, 6, 8, 244, 56, 16);
  ctx.stroke();
  ctx.fillStyle = "#eaf5ea";
  ctx.font = "bold 30px Segoe UI, Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text.slice(0, 16), 128, 38);
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true })
  );
  spr.scale.set(0.5, 0.14, 1);
  spr.renderOrder = 999;
  return spr;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---- Avatar ----------------------------------------------------------------

export class Avatar {
  constructor({ color = 0x8b5a2b, name = "Gorilla", local = false } = {}) {
    this.color = color;
    this.local = local;
    this.root = new THREE.Group();
    this._equipped = new Map(); // slot -> {id, object}

    this.material = skinMat(color);

    // Head
    this.head = new THREE.Group();
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.14, 24, 20), this.material);
    skull.scale.set(1, 0.98, 1.05);
    this.head.add(skull);
    // brow ridge for a "gorilla" read
    const brow = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.03, 0.05),
      skinMat(0x000000)
    );
    brow.material = new THREE.MeshStandardMaterial({ color: 0x2a1a10, roughness: 0.8 });
    brow.position.set(0, 0.02, 0.12);
    this.head.add(brow);
    // eyes
    const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4 });
    const pupil = new THREE.MeshStandardMaterial({ color: 0x120c08 });
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 12), eyeWhite);
      e.position.set(s * 0.05, 0.0, 0.125);
      e.scale.set(1, 1.1, 0.6);
      this.head.add(e);
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.014, 10, 10), pupil);
      p.position.set(s * 0.05, 0.0, 0.15);
      this.head.add(p);
    }
    // muzzle
    const muzzle = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 16, 14),
      skinMat(shade(color, 0.82))
    );
    muzzle.scale.set(1, 0.7, 0.8);
    muzzle.position.set(0, -0.05, 0.1);
    this.head.add(muzzle);
    this.root.add(this.head);

    // Torso
    this.body = new THREE.Group();
    const torso = new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 20, 16),
      this.material
    );
    torso.scale.set(1, 1.15, 0.85);
    this.body.add(torso);
    // upper-chest mass for a stockier silhouette
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), this.material);
    chest.position.set(0, 0.12, 0.02);
    chest.scale.set(1.15, 0.8, 0.9);
    this.body.add(chest);
    this.root.add(this.body);

    // Hands + arms
    this.handL = new Hand(color, true);
    this.handR = new Hand(color, false);
    this.root.add(this.handL.group, this.handR.group);

    this.armL = this._buildArm();
    this.armR = this._buildArm();
    this.root.add(this.armL, this.armR);

    // Cosmetic anchors.
    this.anchors = {
      hat: new THREE.Group(),
      face: new THREE.Group(),
      ears: new THREE.Group(),
      torso: new THREE.Group(),
      handR: new THREE.Group(),
    };
    this.anchors.hat.position.set(0, 0.14, 0);
    this.head.add(this.anchors.hat);
    this.anchors.face.position.set(0, -0.01, 0.02);
    this.head.add(this.anchors.face);
    this.anchors.ears.position.set(0, -0.03, 0);
    this.head.add(this.anchors.ears);
    this.anchors.torso.position.set(0, 0.02, 0);
    this.body.add(this.anchors.torso);
    this.anchors.handR.position.set(0, 0, 0);
    this.handR.group.add(this.anchors.handR);

    // Name tag.
    this.name = name;
    this.infected = false;
    this.nameTag = makeNameTag(name, false);
    this.nameTag.position.set(0, 0.32, 0);
    this.head.add(this.nameTag);

    this.castShadows();
  }

  _buildArm() {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.045, 1, 12),
      this.material
    );
    arm.geometry.translate(0, -0.5, 0); // pivot at the top (shoulder)
    return arm;
  }

  castShadows() {
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = false;
      }
    });
  }

  setColor(color) {
    this.color = color;
    this.material.color.setHex(color);
    this.handL.setColor(color);
    this.handR.setColor(color);
  }

  setName(name) {
    this.name = name;
    this._refreshNameTag();
  }

  setInfected(v) {
    if (this.infected === v) return;
    this.infected = v;
    this._refreshNameTag();
  }

  _refreshNameTag() {
    const old = this.nameTag;
    this.nameTag = makeNameTag(this.name, this.infected);
    this.nameTag.position.copy(old.position);
    this.head.add(this.nameTag);
    this.head.remove(old);
    old.material.map.dispose();
    old.material.dispose();
  }

  /**
   * Equip a set of cosmetic ids. Slots are exclusive, so equipping a new hat
   * removes the previous one.
   */
  setCosmetics(ids) {
    // Remove anything not in the new set.
    const wanted = new Set(ids);
    for (const [slot, entry] of [...this._equipped]) {
      if (!wanted.has(entry.id)) {
        entry.object.parent?.remove(entry.object);
        this._equipped.delete(slot);
      }
    }
    for (const id of ids) {
      const def = COSMETIC_BY_ID[id];
      if (!def) continue;
      const existing = this._equipped.get(def.slot);
      if (existing && existing.id === id) continue;
      if (existing) existing.object.parent?.remove(existing.object);
      const obj = buildCosmetic(id);
      if (!obj) continue;
      this.anchors[def.anchor].add(obj);
      this._equipped.set(def.slot, { id, object: obj });
    }
  }

  /**
   * Drive the avatar from head + hand transforms (in root-local space) plus
   * finger curls. Body follows the head's horizontal position and yaw.
   */
  setPose(pose) {
    const h = pose.head;
    this.head.position.copy(h.pos);
    this.head.quaternion.copy(h.quat);

    // Torso hangs below the head, upright, yaw-aligned to look direction.
    const yaw = yawFromQuat(h.quat);
    this.body.position.set(h.pos.x, h.pos.y - 0.42, h.pos.z);
    this.body.rotation.set(0, yaw, 0);

    // Hands.
    this._applyHand(this.handL, pose.hands.left);
    this._applyHand(this.handR, pose.hands.right);

    // Stretchy arms from shoulders to hands.
    const shoulderY = h.pos.y - 0.18;
    this._applyArm(
      this.armL,
      _shoulderL.set(
        h.pos.x - Math.cos(yaw) * 0.19,
        shoulderY,
        h.pos.z + Math.sin(yaw) * 0.19
      ),
      pose.hands.left.pos
    );
    this._applyArm(
      this.armR,
      _shoulderR.set(
        h.pos.x + Math.cos(yaw) * 0.19,
        shoulderY,
        h.pos.z - Math.sin(yaw) * 0.19
      ),
      pose.hands.right.pos
    );
  }

  _applyHand(hand, data) {
    hand.group.position.copy(data.pos);
    hand.group.quaternion.copy(data.quat);
    // Grip space forward is -Z; the model's fingers point +Z, so rotate the
    // model to point where the controller points, then tilt the palm down a
    // touch so it reads as a relaxed hand.
    hand.group.rotateY(Math.PI);
    hand.group.rotateX(0.35);
    hand.setFingers(data.trigger || 0, data.grip || 0, data.thumb || 0);
  }

  _applyArm(arm, shoulder, handPos) {
    arm.position.copy(shoulder);
    const dir = _armDir.copy(handPos).sub(shoulder);
    const len = dir.length();
    arm.scale.set(1, Math.max(len, 0.001), 1);
    // Point the arm's -Y axis (its length) at the hand.
    _armUp.set(0, -1, 0);
    dir.normalize();
    arm.quaternion.setFromUnitVectors(_armUp, dir);
  }

  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh) {
        o.geometry?.dispose();
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material?.dispose();
      }
      if (o.isSprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
  }
}

function shade(hex, factor) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(factor);
  return c.getHex();
}

function yawFromQuat(q) {
  // Extract yaw (rotation about Y) from a quaternion.
  _fwd.set(0, 0, -1).applyQuaternion(q);
  return Math.atan2(_fwd.x, _fwd.z) + Math.PI;
}

const _fwd = new THREE.Vector3();
const _shoulderL = new THREE.Vector3();
const _shoulderR = new THREE.Vector3();
const _armDir = new THREE.Vector3();
const _armUp = new THREE.Vector3();
