// Remote player manager: spawns an Avatar per networked peer and plays their
// state back with a small interpolation delay so motion looks smooth even with
// jittery packet timing. Tracks position, head + hand transforms, finger curls,
// name, colour, cosmetics and infection state.

import * as THREE from "three";
import { CONFIG } from "../config.js";
import { Avatar } from "./avatar.js";

const BUFFER_MAX = 20;

class RemotePlayer {
  constructor(scene, name, color) {
    this.avatar = new Avatar({ name, color, local: false });
    // Hidden until the first state packet arrives so nobody pops in at origin.
    this.avatar.root.visible = false;
    scene.add(this.avatar.root);
    this.snapshots = []; // {t, rig, head:{pos,quat}, left:{...}, right:{...}}
    this.name = name;
    this.color = color;
    this.cosmetics = [];
    this.infected = false;
    this.map = null; // which map they're on (null until first state)
  }

  pushState(msg) {
    const now = performance.now();
    const s = {
      t: now,
      rig: new THREE.Vector3(msg.p[0], msg.p[1], msg.p[2]),
      head: unpackTransform(msg.hd),
      left: unpackHand(msg.hl),
      right: unpackHand(msg.hr),
    };
    this.snapshots.push(s);
    if (this.snapshots.length > BUFFER_MAX) this.snapshots.shift();

    if (typeof msg.n === "string" && msg.n !== this.name) {
      this.name = msg.n;
      this.avatar.setName(msg.n);
    }
    if (Number.isFinite(msg.c) && msg.c !== this.color) {
      this.color = msg.c;
      this.avatar.setColor(msg.c);
    }
    if (Array.isArray(msg.cos) && !sameArray(msg.cos, this.cosmetics)) {
      this.cosmetics = msg.cos.slice();
      this.avatar.setCosmetics(this.cosmetics);
    }
    if (typeof msg.m === "string") this.map = msg.m;
  }

  setInfected(v) {
    this.infected = v;
    this.avatar.setInfected(v);
  }

  render(renderTime) {
    const snaps = this.snapshots;
    if (snaps.length === 0) return;
    // Find the two snapshots surrounding renderTime.
    let a = snaps[0];
    let b = snaps[snaps.length - 1];
    for (let i = 0; i < snaps.length - 1; i++) {
      if (snaps[i].t <= renderTime && snaps[i + 1].t >= renderTime) {
        a = snaps[i];
        b = snaps[i + 1];
        break;
      }
    }
    let alpha = 0;
    if (b.t > a.t) alpha = (renderTime - a.t) / (b.t - a.t);
    alpha = Math.max(0, Math.min(1, alpha));

    _rig.copy(a.rig).lerp(b.rig, alpha);
    this.avatar.root.position.copy(_rig);

    const pose = {
      head: lerpTransform(a.head, b.head, alpha, _t0),
      hands: {
        left: lerpHand(a.left, b.left, alpha, _t1),
        right: lerpHand(a.right, b.right, alpha, _t2),
      },
    };
    this.avatar.setPose(pose);

    // Name tags face the local camera.
    this.avatar.nameTag.quaternion.identity();
  }

  dispose(scene) {
    scene.remove(this.avatar.root);
    this.avatar.dispose();
  }
}

export class RemotePlayers {
  constructor(scene) {
    this.scene = scene;
    this.players = new Map(); // id -> RemotePlayer
  }

  ensure(id, name = "Gorilla", color = CONFIG.defaultColor) {
    let p = this.players.get(id);
    if (!p) {
      p = new RemotePlayer(this.scene, name, color);
      this.players.set(id, p);
    }
    return p;
  }

  onState(msg) {
    if (!msg.id || !msg.p) return;
    const p = this.ensure(msg.id, msg.n, msg.c);
    p.pushState(msg);
  }

  onJoin(msg) {
    this.ensure(msg.id, msg.name);
  }

  onRename(msg) {
    const p = this.players.get(msg.id);
    if (p) {
      p.name = msg.name;
      p.avatar.setName(msg.name);
    }
  }

  onLeave(msg) {
    const p = this.players.get(msg.id);
    if (p) {
      p.dispose(this.scene);
      this.players.delete(msg.id);
    }
  }

  setInfectedSet(ids) {
    const set = new Set(ids);
    for (const [id, p] of this.players) p.setInfected(set.has(id));
  }

  clear() {
    for (const [, p] of this.players) p.dispose(this.scene);
    this.players.clear();
  }

  update(localMap) {
    const renderTime = performance.now() - CONFIG.interpDelayMs;
    for (const [, p] of this.players) {
      // Only show players who are on the same map (and have sent a state).
      const visible = p.snapshots.length > 0 && (!p.map || p.map === localMap);
      p.avatar.root.visible = visible;
      if (visible) p.render(renderTime);
    }
  }

  /** Nearest remote player to a world point, for infection tag detection.
   *  Measures to the torso centre (not the feet) so a hand touch registers.
   *  Skips players on another map (hidden avatars). */
  nearest(point, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const [id, p] of this.players) {
      if (!p.avatar.root.visible) continue;
      p.avatar.body.getWorldPosition(_bodyCentre);
      const d = _bodyCentre.distanceTo(point);
      if (d < bestD) {
        bestD = d;
        best = { id, player: p, dist: d };
      }
    }
    return best;
  }
}

// --- pack/unpack helpers ----------------------------------------------------

function unpackTransform(arr) {
  return {
    pos: new THREE.Vector3(arr[0], arr[1], arr[2]),
    quat: new THREE.Quaternion(arr[3], arr[4], arr[5], arr[6]),
  };
}

function unpackHand(arr) {
  return {
    pos: new THREE.Vector3(arr[0], arr[1], arr[2]),
    quat: new THREE.Quaternion(arr[3], arr[4], arr[5], arr[6]),
    trigger: arr[7],
    grip: arr[8],
    thumb: arr[9],
  };
}

function lerpTransform(a, b, alpha, out) {
  out.pos = out.pos || new THREE.Vector3();
  out.quat = out.quat || new THREE.Quaternion();
  out.pos.copy(a.pos).lerp(b.pos, alpha);
  out.quat.copy(a.quat).slerp(b.quat, alpha);
  return out;
}

function lerpHand(a, b, alpha, out) {
  out.pos = out.pos || new THREE.Vector3();
  out.quat = out.quat || new THREE.Quaternion();
  out.pos.copy(a.pos).lerp(b.pos, alpha);
  out.quat.copy(a.quat).slerp(b.quat, alpha);
  out.trigger = a.trigger + (b.trigger - a.trigger) * alpha;
  out.grip = a.grip + (b.grip - a.grip) * alpha;
  out.thumb = a.thumb + (b.thumb - a.thumb) * alpha;
  return out;
}

function sameArray(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const _rig = new THREE.Vector3();
const _bodyCentre = new THREE.Vector3();
const _t0 = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
const _t1 = {
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  trigger: 0,
  grip: 0,
  thumb: 0,
};
const _t2 = {
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  trigger: 0,
  grip: 0,
  thumb: 0,
};
