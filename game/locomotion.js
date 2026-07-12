// Gorilla-style locomotion.
//
// There are no thumbsticks. You move by planting a hand on the world and
// dragging your body: while a hand is in contact with a surface it acts as an
// anchor, and the rig is pulled so the hand stays put in world space. Releasing
// with speed hands your momentum to the body, so you swing, climb and leap.
//
// The rig is never rotated (turning is physical, like real Gorilla Tag), which
// keeps the maths simple: a controller's rig-local position maps to world via
// rig.localToWorld.

import * as THREE from "three";
import { CONFIG } from "../config.js";

export class Locomotion {
  constructor(rig, input, world) {
    this.rig = rig;
    this.input = input;
    this.world = world; // ColliderWorld

    this.velocity = new THREE.Vector3();
    this.grounded = false;

    this._hand = {
      left: { gripping: false, anchor: new THREE.Vector3() },
      right: { gripping: false, anchor: new THREE.Vector3() },
    };

    this._headWorld = new THREE.Vector3();
    this._enabled = true;
    this._airborne = true;
    this._velHistory = [];
  }

  setEnabled(v) {
    this._enabled = v;
    if (!v) this.velocity.set(0, 0, 0);
  }

  /** Teleport the player so their head ends up at (x, y, z)-ish. */
  spawnAt(x, y, z) {
    // rig origin is the floor; place it under the requested spot.
    this.rig.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this._hand.left.gripping = false;
    this._hand.right.gripping = false;
    this._airborne = true;
    this._velHistory.length = 0;
  }

  update(dt) {
    if (!this._enabled) return;
    dt = Math.min(dt, 1 / 30); // guard against tab-stall explosions
    if (this.input.isVR) this._updateVR(dt);
    else this._updateDesktop(dt);
  }

  // --- VR: hand-driven climbing ------------------------------------------
  _updateVR(dt) {
    const g = CONFIG.gravity * CONFIG.gravityMultiplier;

    // Head world position (for arm-length limiting + body collision).
    this.rig.localToWorld(this._headWorld.copy(this.input.head.pos));

    let touching = 0; // hands in contact with the world this frame
    let pulling = 0; // hands that were already anchored and are dragging us
    const bodyDelta = _v2.set(0, 0, 0);

    for (const side of ["left", "right"]) {
      const hand = this.input.hands[side];
      const st = this._hand[side];
      if (!hand.active) {
        st.gripping = false;
        continue;
      }

      // Hand world position this frame.
      const hw = _v3.copy(hand.pos);
      this.rig.localToWorld(hw);

      // Exactly like Gorilla Tag: hands are always "sticky" against the world —
      // no grip button required. A hand anchors whenever it touches a surface
      // within arm's reach. (Trigger/grip drive the finger animation only.)
      const armLen = hw.distanceTo(this._headWorld);
      const contact = this.world.contact(hw.x, hw.y, hw.z, CONFIG.handRadius);

      if (contact && armLen < CONFIG.maxHandDistance + 0.35) {
        touching++;
        // Corrected hand position: pushed out of the surface it rests on.
        const corr = _v4.copy(hw);
        corr.x += contact.nx * contact.depth;
        corr.y += contact.ny * contact.depth;
        corr.z += contact.nz * contact.depth;

        if (!st.gripping) {
          // First contact: plant the hand. Planting is a hard brake, exactly
          // like slapping a palm onto a surface in GT.
          st.anchor.copy(corr);
          st.gripping = true;
        } else {
          // Move body so the corrected hand returns toward its anchor.
          _v5.copy(st.anchor).sub(corr); // desired body movement
          bodyDelta.add(_v5);
          pulling++;
        }
      } else {
        st.gripping = false;
      }
    }

    if (touching > 0) {
      // Anchored: gravity is irrelevant, the hands own the body.
      if (pulling > 0) {
        // Average the pull from all anchored hands (both anchored => body moves
        // by the shared shortening, not the sum).
        bodyDelta.multiplyScalar(1 / pulling);
        this.rig.position.add(bodyDelta);

        // Track how fast the hands are throwing us; the smoothed value becomes
        // launch velocity the moment every hand lets go.
        _v1.copy(bodyDelta).divideScalar(Math.max(dt, 1e-4));
        this._pushVelSample(_v1);

        // Anchors ride along so a held hand keeps its world grip.
        this._hand.left.anchor.add(bodyDelta);
        this._hand.right.anchor.add(bodyDelta);
      } else {
        // Freshly planted, not moving yet: dead stop.
        this._pushVelSample(_v1.set(0, 0, 0));
      }
      // While any hand is planted the body itself is parked; momentum only
      // exists as the hand-motion history.
      this.velocity.set(0, 0, 0);
      this._airborne = false;
    } else {
      if (!this._airborne) {
        // Just released: hand momentum (averaged over the last few frames)
        // becomes body velocity, with a bit of extra pop.
        this._avgVel(this.velocity).multiplyScalar(CONFIG.jumpMultiplier);
        const spd = this.velocity.length();
        if (spd > CONFIG.velocityLimit) {
          this.velocity.multiplyScalar(CONFIG.velocityLimit / spd);
        }
        this._airborne = true;
        this._velHistory.length = 0;
      }
      this.velocity.y -= g * dt;
      this.rig.position.addScaledVector(this.velocity, dt);
    }

    this._resolveBody(dt);
  }

  _pushVelSample(v) {
    if (!this._velHistory) this._velHistory = [];
    this._velHistory.push([v.x, v.y, v.z]);
    if (this._velHistory.length > 5) this._velHistory.shift();
  }

  _avgVel(out) {
    out.set(0, 0, 0);
    const h = this._velHistory || [];
    if (h.length === 0) return out;
    for (const s of h) {
      out.x += s[0];
      out.y += s[1];
      out.z += s[2];
    }
    return out.divideScalar(h.length);
  }

  // --- Desktop test locomotion (WASD) ------------------------------------
  _updateDesktop(dt) {
    const g = CONFIG.gravity * CONFIG.gravityMultiplier;
    this.velocity.y -= g * dt;

    const keys = this.input.keys;
    const speed = 3.4;
    const forward = _v3.set(0, 0, -1).applyQuaternion(
      _q1.setFromEuler(_e1.set(0, this.input.desktopYaw, 0, "YXZ"))
    );
    const rightv = _v4.set(1, 0, 0).applyQuaternion(_q1);
    const move = _v5.set(0, 0, 0);
    if (keys.has("KeyW")) move.add(forward);
    if (keys.has("KeyS")) move.sub(forward);
    if (keys.has("KeyD")) move.add(rightv);
    if (keys.has("KeyA")) move.sub(rightv);
    if (move.lengthSq() > 0) move.normalize().multiplyScalar(speed);

    this.velocity.x = move.x;
    this.velocity.z = move.z;
    if (keys.has("Space") && this.grounded) {
      this.velocity.y = 4.6;
      this.grounded = false;
    }

    this.rig.position.addScaledVector(this.velocity, dt);
    this.rig.localToWorld(this._headWorld.copy(this.input.head.pos));
    this._resolveBody(dt);
  }

  // --- Shared body collision --------------------------------------------
  _resolveBody(dt) {
    const world = this.world;

    // Foot sphere near the rig origin keeps us standing on ground / off low walls.
    const footR = CONFIG.bodyRadius + 0.08;
    const foot = _v6.set(
      this.rig.position.x,
      this.rig.position.y + footR,
      this.rig.position.z
    );
    const before = _v7.copy(foot);
    const c = world.resolveSphere(foot, footR);
    const corr = _v8.copy(foot).sub(before);
    this.rig.position.add(corr);

    this.grounded = false;
    if (c.hit && c.ny > 0.4) {
      this.grounded = true;
      if (this.velocity.y < 0) this.velocity.y = 0;
      // ground friction
      this.velocity.x *= 1 - CONFIG.groundFriction;
      this.velocity.z *= 1 - CONFIG.groundFriction;
    } else if (c.hit) {
      // Slid along a wall: kill velocity into the surface.
      const vn = this.velocity.x * c.nx + this.velocity.y * c.ny + this.velocity.z * c.nz;
      if (vn < 0) {
        this.velocity.x -= c.nx * vn;
        this.velocity.y -= c.ny * vn;
        this.velocity.z -= c.nz * vn;
      }
    }

    // Head/torso sphere stops the upper body clipping through walls & ceilings.
    this.rig.localToWorld(this._headWorld.copy(this.input.head.pos));
    const headR = CONFIG.bodyRadius;
    const head = _v6.copy(this._headWorld);
    const hb = _v7.copy(head);
    const hc = world.resolveSphere(head, headR);
    if (hc.hit) {
      const push = _v8.copy(head).sub(hb);
      // Only apply the horizontal + ceiling part; never shove the player upward
      // out of the floor (the foot sphere owns vertical support).
      this.rig.position.x += push.x;
      this.rig.position.z += push.z;
      if (push.y < 0) this.rig.position.y += push.y; // ceiling
      const vn =
        this.velocity.x * hc.nx + this.velocity.y * hc.ny + this.velocity.z * hc.nz;
      if (vn < 0) {
        this.velocity.x -= hc.nx * vn;
        this.velocity.z -= hc.nz * vn;
      }
    }
    void dt;
  }
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _v4 = new THREE.Vector3();
const _v5 = new THREE.Vector3();
const _v6 = new THREE.Vector3();
const _v7 = new THREE.Vector3();
const _v8 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _e1 = new THREE.Euler();
