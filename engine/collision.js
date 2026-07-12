// Analytic sphere-vs-primitive collision.
//
// Maps are authored from a handful of primitive colliders (ground, box/OBB,
// sphere, vertical cylinder). Colliding a sphere against primitives is cheap,
// stable and never produces the tunnelling/NaN glitches you get from meshing an
// arbitrary triangle soup — which is exactly what we want for hand-driven
// climbing that must "work with no errors".
//
// Every collider exposes `signedDistance(point) -> { sd, nx, ny, nz }`:
//   sd  : signed distance from `point` to the collider surface
//         (> 0 outside, < 0 inside).
//   n*  : unit surface normal pointing OUT of the collider toward `point`.

import * as THREE from "three";

const _v = new THREE.Vector3();
const _local = new THREE.Vector3();
const _q = new THREE.Quaternion();

function makeResult() {
  return { sd: Infinity, nx: 0, ny: 1, nz: 0 };
}

// --- Individual primitive signed-distance functions ------------------------

function groundSD(c, px, py, pz, out) {
  out.sd = py - c.height;
  out.nx = 0;
  out.ny = 1;
  out.nz = 0;
}

function sphereSD(c, px, py, pz, out) {
  const dx = px - c.cx;
  const dy = py - c.cy;
  const dz = pz - c.cz;
  const d = Math.hypot(dx, dy, dz) || 1e-6;
  out.sd = d - c.r;
  out.nx = dx / d;
  out.ny = dy / d;
  out.nz = dz / d;
}

function boxSD(c, px, py, pz, out) {
  // Move query point into the box's local (unrotated) frame.
  _v.set(px - c.cx, py - c.cy, pz - c.cz);
  if (c.quat) {
    _q.copy(c.quat).invert();
    _v.applyQuaternion(_q);
  }
  const hx = c.hx,
    hy = c.hy,
    hz = c.hz;
  const lx = _v.x,
    ly = _v.y,
    lz = _v.z;
  const inside = Math.abs(lx) < hx && Math.abs(ly) < hy && Math.abs(lz) < hz;

  let nlx = 0,
    nly = 0,
    nlz = 0,
    sd;
  if (inside) {
    // Signed distance = negative distance to nearest face.
    const dx = hx - Math.abs(lx);
    const dy = hy - Math.abs(ly);
    const dz = hz - Math.abs(lz);
    const m = Math.min(dx, dy, dz);
    sd = -m;
    if (m === dx) nlx = Math.sign(lx) || 1;
    else if (m === dy) nly = Math.sign(ly) || 1;
    else nlz = Math.sign(lz) || 1;
  } else {
    const cx = Math.max(-hx, Math.min(hx, lx));
    const cy = Math.max(-hy, Math.min(hy, ly));
    const cz = Math.max(-hz, Math.min(hz, lz));
    nlx = lx - cx;
    nly = ly - cy;
    nlz = lz - cz;
    const d = Math.hypot(nlx, nlz) === 0 && nly === 0 ? 1e-6 : Math.hypot(nlx, nly, nlz);
    sd = d;
    nlx /= d || 1e-6;
    nly /= d || 1e-6;
    nlz /= d || 1e-6;
  }
  // Rotate the local normal back into world space.
  if (c.quat) {
    _v.set(nlx, nly, nlz).applyQuaternion(c.quat);
    out.nx = _v.x;
    out.ny = _v.y;
    out.nz = _v.z;
  } else {
    out.nx = nlx;
    out.ny = nly;
    out.nz = nlz;
  }
  out.sd = sd;
}

function cylinderSD(c, px, py, pz, out) {
  // Vertical solid cylinder: base (cy) .. top (cy + h), radius r about (cx,cz).
  const dx = px - c.cx;
  const dz = pz - c.cz;
  const rd = Math.hypot(dx, dz) || 1e-6; // radial distance from axis
  const top = c.cy + c.h;
  const aOut = rd - c.r; // > 0 outside radially
  const belowBy = c.cy - py; // > 0 below the base
  const aboveBy = py - top; // > 0 above the top
  const axialOut = Math.max(belowBy, aboveBy);

  if (axialOut <= 0 && aOut <= 0) {
    // Inside the solid cylinder — least penetration wins.
    const rin = c.r - rd; // to side wall
    const din = py - c.cy; // to base
    const uin = top - py; // to top
    const m = Math.min(rin, din, uin);
    out.sd = -m;
    if (m === rin) {
      out.nx = dx / rd;
      out.ny = 0;
      out.nz = dz / rd;
    } else if (m === din) {
      out.nx = 0;
      out.ny = -1;
      out.nz = 0;
    } else {
      out.nx = 0;
      out.ny = 1;
      out.nz = 0;
    }
    return;
  }

  if (aOut > 0 && axialOut <= 0) {
    // Beside the wall, within the height range.
    out.sd = aOut;
    out.nx = dx / rd;
    out.ny = 0;
    out.nz = dz / rd;
    return;
  }

  if (aOut <= 0 && axialOut > 0) {
    // Directly above/below a cap.
    out.sd = axialOut;
    out.nx = 0;
    out.ny = belowBy > 0 ? -1 : 1;
    out.nz = 0;
    return;
  }

  // Nearest point is on the rim circle (edge of a cap).
  const capY = belowBy > 0 ? c.cy : top;
  const rimX = c.cx + (dx / rd) * c.r;
  const rimZ = c.cz + (dz / rd) * c.r;
  let nx = px - rimX;
  let ny = py - capY;
  let nz = pz - rimZ;
  const d = Math.hypot(nx, ny, nz) || 1e-6;
  out.sd = d;
  out.nx = nx / d;
  out.ny = ny / d;
  out.nz = nz / d;
}

// --- Collider world ---------------------------------------------------------

export class ColliderWorld {
  constructor() {
    this.colliders = [];
  }

  clear() {
    this.colliders.length = 0;
  }

  addGround(height = 0) {
    this.colliders.push({ kind: groundSD, height });
    return this;
  }

  addSphere(cx, cy, cz, r) {
    this.colliders.push({ kind: sphereSD, cx, cy, cz, r });
    return this;
  }

  /** center + half extents; optional THREE.Quaternion for an oriented box. */
  addBox(cx, cy, cz, hx, hy, hz, quat = null) {
    this.colliders.push({ kind: boxSD, cx, cy, cz, hx, hy, hz, quat });
    return this;
  }

  /** base-centred vertical cylinder: (cx,cy,cz) is bottom centre. */
  addCylinder(cx, cy, cz, r, h) {
    this.colliders.push({ kind: cylinderSD, cx, cy, cz, r, h });
    return this;
  }

  /**
   * Resolve a solid sphere against every collider, pushing it out of overlaps.
   * Mutates `center` (a THREE.Vector3). Returns a contact summary useful for
   * grounding checks. Runs a couple of relaxation iterations so corners settle.
   */
  resolveSphere(center, radius, out = _contact) {
    out.hit = false;
    out.groundY = -Infinity;
    out.nx = 0;
    out.ny = 0;
    out.nz = 0;
    const res = _tmpRes;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (let i = 0; i < this.colliders.length; i++) {
        const col = this.colliders[i];
        col.kind(col, center.x, center.y, center.z, res);
        const overlap = radius - res.sd;
        if (overlap > 0.00001) {
          center.x += res.nx * overlap;
          center.y += res.ny * overlap;
          center.z += res.nz * overlap;
          moved = true;
          out.hit = true;
          // Accumulate an averaged contact normal for the caller.
          out.nx += res.nx;
          out.ny += res.ny;
          out.nz += res.nz;
          if (res.ny > 0.4) out.groundY = Math.max(out.groundY, center.y);
        }
      }
      if (!moved) break;
    }
    const nlen = Math.hypot(out.nx, out.ny, out.nz);
    if (nlen > 1e-5) {
      out.nx /= nlen;
      out.ny /= nlen;
      out.nz /= nlen;
    }
    return out;
  }

  /**
   * Cheap contact test for a hand sphere: is it touching any surface, and if so
   * what is the outward normal? Returns null when free. Used by locomotion to
   * decide whether a hand can "grab" the world.
   */
  contact(px, py, pz, radius, out = _handContact) {
    const res = _tmpRes;
    let best = radius; // only care about overlaps (sd < radius)
    out.hit = false;
    for (let i = 0; i < this.colliders.length; i++) {
      const col = this.colliders[i];
      col.kind(col, px, py, pz, res);
      if (res.sd < best) {
        best = res.sd;
        out.hit = true;
        out.nx = res.nx;
        out.ny = res.ny;
        out.nz = res.nz;
        out.depth = radius - res.sd;
      }
    }
    return out.hit ? out : null;
  }
}

const _contact = { hit: false, groundY: -Infinity, nx: 0, ny: 0, nz: 0 };
const _handContact = { hit: false, nx: 0, ny: 0, nz: 0, depth: 0 };
const _tmpRes = makeResult();
