// Input abstraction: unifies WebXR controllers and a desktop keyboard/mouse
// fallback behind one interface so the rest of the game does not care which is
// active.
//
// Per hand we expose everything the avatar + locomotion + finger rig need:
//   pos, quat   — grip pose in RIG space
//   trigger     — index-finger curl   (0..1)
//   grip        — middle/ring/pinky curl (0..1)
//   thumb       — thumb curl from A/X (or B/Y / stick touch) (0..1)
//   primaryDown / secondaryDown — edge-usable button booleans
//   active      — tracked this frame

import * as THREE from "three";

export class InputSystem {
  constructor(renderer, rig, camera) {
    this.renderer = renderer;
    this.rig = rig;
    this.camera = camera;

    this.hands = {
      left: this._makeHand(),
      right: this._makeHand(),
    };

    // Head pose in rig space (filled each update).
    this.head = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };

    // Desktop fallback state.
    this.keys = new Set();
    this.desktopYaw = 0;
    this.desktopPitch = 0;
    this.pointerLocked = false;
    this.interactPressed = false; // edge-triggered "E"
    this._interactLatch = false;

    this._controllers = [];
    this._setupXRControllers();
    this._setupDesktop();
  }

  _makeHand() {
    return {
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      trigger: 0,
      grip: 0,
      thumb: 0,
      primaryDown: false,
      secondaryDown: false,
      active: false,
      // last frame position for locomotion delta
      prevPos: new THREE.Vector3(),
      source: null,
    };
  }

  _setupXRControllers() {
    for (let i = 0; i < 2; i++) {
      const grip = this.renderer.xr.getControllerGrip(i);
      this.rig.add(grip);
      const controller = this.renderer.xr.getController(i);
      this.rig.add(controller);
      controller.addEventListener("connected", (e) => {
        controller.userData.inputSource = e.data;
        grip.userData.inputSource = e.data;
      });
      controller.addEventListener("disconnected", () => {
        controller.userData.inputSource = null;
        grip.userData.inputSource = null;
      });
      this._controllers.push({ grip, controller });
    }
  }

  _setupDesktop() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.code === "KeyE" && !this._interactLatch) {
        this.interactPressed = true;
        this._interactLatch = true;
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      if (e.code === "KeyE") this._interactLatch = false;
    });
    const canvas = this.renderer.domElement;
    canvas.addEventListener("click", () => {
      if (!this.renderer.xr.isPresenting && !this.pointerLocked) {
        canvas.requestPointerLock?.();
      }
    });
    document.addEventListener("pointerlockchange", () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });
    this._mouseDown = false;
    window.addEventListener("mousedown", (e) => {
      if (e.button === 0) this._mouseDown = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this._mouseDown = false;
    });
    document.addEventListener("mousemove", (e) => {
      if (!this.pointerLocked) return;
      this.desktopYaw -= e.movementX * 0.0025;
      this.desktopPitch -= e.movementY * 0.0025;
      const lim = Math.PI / 2 - 0.05;
      this.desktopPitch = Math.max(-lim, Math.min(lim, this.desktopPitch));
    });
  }

  get isVR() {
    return this.renderer.xr.isPresenting;
  }

  /** Consume the one-shot interact edge (E key / desktop). */
  takeInteract() {
    const v = this.interactPressed;
    this.interactPressed = false;
    return v;
  }

  update() {
    if (this.isVR) this._updateXR();
    else this._updateDesktop();
  }

  _updateXR() {
    // Head pose comes from the XR camera, expressed in rig-local space.
    const cam = this.renderer.xr.getCamera();
    this.rig.worldToLocal(this.head.pos.copy(cam.getWorldPosition(_tmpV)));
    // camera world quaternion -> rig local
    _tmpQ.copy(this.rig.getWorldQuaternion(_tmpQ2)).invert();
    this.head.quat.copy(_tmpQ).multiply(cam.getWorldQuaternion(_tmpQ3));

    for (let i = 0; i < this._controllers.length; i++) {
      const { grip, controller } = this._controllers[i];
      const src = controller.userData.inputSource;
      if (!src) continue;
      const hand = src.handedness === "left" ? this.hands.left : this.hands.right;
      hand.source = src;
      hand.active = true;
      // grip.position/quaternion are already in rig-local space (added to rig).
      hand.pos.copy(grip.position);
      hand.quat.copy(grip.quaternion);

      const gp = src.gamepad;
      if (gp && gp.buttons.length) {
        hand.trigger = gp.buttons[0]?.value ?? 0;
        hand.grip = gp.buttons[1]?.value ?? 0;
        const a = gp.buttons[4];
        const b = gp.buttons[5];
        const stick = gp.buttons[3];
        hand.primaryDown = !!a?.pressed;
        hand.secondaryDown = !!b?.pressed;
        const thumbTouch =
          a?.touched || b?.touched || stick?.touched || a?.pressed || b?.pressed;
        hand.thumb = thumbTouch ? 1 : 0;
      }
    }

    // Any controller not seen this frame is marked inactive next _updateXR pass;
    // simplest is to reset active flags at end for hands whose source vanished.
    for (const key of ["left", "right"]) {
      const h = this.hands[key];
      if (h.source && !this._sourceStillConnected(h.source)) {
        h.active = false;
        h.source = null;
      }
    }
  }

  _sourceStillConnected(src) {
    return this._controllers.some((c) => c.controller.userData.inputSource === src);
  }

  _updateDesktop() {
    // Head sits at a comfortable standing height; look driven by mouse.
    this.head.pos.set(0, 1.6, 0);
    _tmpE.set(this.desktopPitch, this.desktopYaw, 0, "YXZ");
    this.head.quat.setFromEuler(_tmpE);

    // Fabricate two idle hands in front of the player so the avatar still has
    // arms while testing on desktop. Grabs when holding the mouse.
    const grabbing = this._mouseDown;
    for (const [key, dx] of [
      ["left", -0.2],
      ["right", 0.2],
    ]) {
      const h = this.hands[key];
      h.active = true;
      h.pos.set(dx, 1.15, -0.35);
      h.pos.applyQuaternion(_tmpQ.setFromEuler(_tmpE.set(0, this.desktopYaw, 0, "YXZ")));
      h.pos.y = 1.15;
      h.quat.copy(this.head.quat);
      h.trigger = this.keys.has("KeyF") ? 1 : 0;
      h.grip = grabbing ? 1 : 0;
      h.thumb = this.keys.has("Space") ? 1 : 0;
      h.primaryDown = this.keys.has("Space");
      h.secondaryDown = false;
    }
  }
}

const _tmpV = new THREE.Vector3();
const _tmpQ = new THREE.Quaternion();
const _tmpQ2 = new THREE.Quaternion();
const _tmpQ3 = new THREE.Quaternion();
const _tmpE = new THREE.Euler();
