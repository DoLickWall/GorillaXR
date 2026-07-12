// Jungle Tag — main orchestrator.
// Boots the renderer/scene, wires every system together, and runs the frame
// loop for both WebXR and the desktop test fallback.

import * as THREE from "three";
import { CONFIG } from "./config.js";
import { ColliderWorld } from "./engine/collision.js";
import { InputSystem } from "./engine/input.js";
import { createVRButton } from "./engine/vrbutton.js";
import { Sfx } from "./engine/sfx.js";
import { Locomotion } from "./game/locomotion.js";
import { Avatar } from "./game/avatar.js";
import { Inventory } from "./game/inventory.js";
import { Network } from "./game/network.js";
import { RemotePlayers } from "./game/remotePlayers.js";
import { GameModes } from "./game/gamemodes.js";
import { Hud } from "./game/ui.js";
import { buildMap } from "./game/maps.js";
import { ComputerPanel, InventoryPanel, ShopPanel } from "./game/panels.js";

class Game {
  constructor() {
    this.started = false;
    this._setupRenderer();
    this._setupScene();
    this._setupSystems();
    this._setupPointer();
    this._setupMenu();
    window.addEventListener("resize", () => this._onResize());
  }

  // --- boot ---------------------------------------------------------------
  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    this.renderer.xr.setReferenceSpaceType("local-floor");
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(this.renderer.domElement);
  }

  _setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd3ff);

    this.camera = new THREE.PerspectiveCamera(
      70,
      window.innerWidth / window.innerHeight,
      0.05,
      500
    );
    this.camera.position.set(0, 1.6, 0);

    this.rig = new THREE.Group();
    this.rig.add(this.camera);
    this.scene.add(this.rig);

    // Lighting.
    this.hemi = new THREE.HemisphereLight(0x88aacc, 0x35502f, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 1.5);
    this.sun.position.set(20, 40, 15);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -35;
    sc.right = 35;
    sc.top = 35;
    sc.bottom = -35;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0004;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
  }

  _setupSystems() {
    this.world = new ColliderWorld();
    this.input = new InputSystem(this.renderer, this.rig, this.camera);
    this.loco = new Locomotion(this.rig, this.input, this.world);
    this.inventory = new Inventory();
    this.network = new Network();
    this.remotePlayers = new RemotePlayers(this.scene);
    this.hud = new Hud();
    this.sfx = new Sfx();
    this.gameModes = new GameModes({
      input: this.input,
      network: this.network,
      remotePlayers: this.remotePlayers,
      hud: this.hud,
    });

    this.settings = { dominant: "right", vignette: false, nameTags: true, sfx: true };

    // Local avatar (its own head is hidden so you don't see inside your skull).
    this.localAvatar = new Avatar({
      color: this.inventory.color,
      name: this.inventory.name,
      local: true,
    });
    this.localAvatar.head.visible = false;
    this.rig.add(this.localAvatar.root);
    this.localAvatar.setCosmetics(this.inventory.equippedList());

    this.clock = new THREE.Clock();
    this.panels = [];
    this.panelMeshes = [];
    this._lastNetSend = 0;
    this._coinTimer = 0;

    this._wireNetwork();
  }

  _setupPointer() {
    // A cursor dot + laser line used to click world panels.
    this.cursor = new THREE.Mesh(
      new THREE.SphereGeometry(0.012, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x7dd66d })
    );
    this.cursor.visible = false;
    this.cursor.renderOrder = 998;
    this.scene.add(this.cursor);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(0, 0, -1),
    ]);
    this.laser = new THREE.Line(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0x7dd66d, transparent: true, opacity: 0.5 })
    );
    this.laser.visible = false;
    this.scene.add(this.laser);

    this.raycaster = new THREE.Raycaster();
    this.raycaster.far = 6;
    this.hovered = null;
    this._triggerWasDown = false;
    this._clickQueued = false;
    window.addEventListener("mousedown", (e) => {
      if (e.button === 0) this._clickQueued = true;
    });

    // Comfort vignette that follows the head.
    this.comfort = new THREE.Group();
    this.scene.add(this.comfort);
    const vig = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.7),
      new THREE.MeshBasicMaterial({
        map: makeVignetteTexture(),
        transparent: true,
        depthTest: false,
        opacity: 0.9,
      })
    );
    vig.position.set(0, 0, -0.25);
    vig.renderOrder = 997;
    this.vignette = vig;
    this.vignette.visible = false;
    this.comfort.add(vig);
  }

  // --- menu ---------------------------------------------------------------
  _setupMenu() {
    this.menu = document.getElementById("menu");
    this.status = document.getElementById("status");
    this.status.textContent = "You are " + this.inventory.name;

    document.getElementById("descBtn").addEventListener("click", () => {
      const el = document.getElementById("howto");
      el.hidden = !el.hidden;
    });

    const enterButtons = document.getElementById("enterButtons");
    const vrBtn = createVRButton(this.renderer, {
      onStart: () => this._begin(),
      onEnd: () => {},
    });
    enterButtons.appendChild(vrBtn);

    const deskBtn = document.createElement("button");
    deskBtn.textContent = "Play on Desktop";
    deskBtn.addEventListener("click", () => this._begin());
    enterButtons.appendChild(deskBtn);
  }

  _begin() {
    if (this.started) return;
    this.started = true;

    // No lobby form: jump straight in. Everything (name/colour/room/map/mode)
    // is changed in-world at the computer, like the real thing.
    this.currentMap = "forest";
    this.currentRoom = "public";
    this._checkWally(this.inventory.name, { quiet: true });

    this.localAvatar.setName(this.inventory.name);
    this.localAvatar.setColor(this.inventory.color);
    this.localAvatar.setCosmetics(this.inventory.equippedList());

    this._loadMap(this.currentMap);
    this.gameModes.setMode("casual");

    // Networking (degrades to solo on failure).
    this.network.connect(this.currentRoom, this.inventory.name);
    this.sfx.unlock();

    this.menu.parentElement.style.display = "none";
    this.hud.show();
    this.gameModes._refreshBadge();
    this.hud.showToast(
      "You are " + this.inventory.name + " — change it at the stump computer"
    );

    // Desktop mode: capture the mouse right away (this runs inside the button
    // click gesture, so the browser allows it) and show a crosshair.
    if (!this.renderer.xr.isPresenting) {
      document.getElementById("crosshair").hidden = false;
      this.renderer.domElement.requestPointerLock?.();
    }

    this.renderer.setAnimationLoop((t, frame) => this._loop(t, frame));
  }

  /** Naming yourself "wally" grants moderator (and with it, The Stick). */
  _checkWally(name, { quiet = false } = {}) {
    const isWally = name.trim().toLowerCase() === "wally";
    if (isWally === this.inventory.isMod) return;
    this.inventory.setMod(isWally);
    this.localAvatar.setCosmetics(this.inventory.equippedList());
    if (quiet) return;
    if (isWally) {
      this.hud.showToast("👋 Welcome, moderator. The Stick is in your inventory.");
      this.sfx.buy();
    } else {
      this.hud.showToast("Moderator powers left with wally.");
    }
  }

  _joinRoom(code) {
    if (code === this.currentRoom) {
      this.hud.showToast("Already in room \"" + code + "\"");
      return;
    }
    this.currentRoom = code;
    this.network.disconnect();
    this.remotePlayers.clear();
    this.gameModes.setLocalId(null);
    this.gameModes.applyInfected([], this.gameModes.mode);
    this.network.connect(code, this.inventory.name);
    this.hud.showToast("Joining room \"" + code + "\"…");
  }

  _travel(map) {
    if (map === this.currentMap) {
      this.hud.showToast("You're already there!");
      return;
    }
    this.currentMap = map;
    this._loadMap(map);
    this.hud.showToast(
      map === "forest" ? "Back to the forest" : "Traveled to the " + map
    );
  }

  _setMode(mode) {
    if (this.network.connected) {
      this.network.setMode(mode); // server confirms + broadcasts to the room
    } else {
      this.gameModes.setMode(mode);
      this.hud.showToast(mode === "infection" ? "Infection (solo — no one to tag)" : "Casual mode");
    }
  }

  _ctx() {
    return {
      inventory: this.inventory,
      settings: this.settings,
      applyName: (name) => {
        this.inventory.setName(name);
        this.localAvatar.setName(name);
        this.network.sendRename(name);
        this._checkWally(name);
      },
      applyColor: (hex) => {
        this.inventory.setColor(hex);
        this.localAvatar.setColor(hex);
      },
      applyCosmetics: () => {
        this.localAvatar.setCosmetics(this.inventory.equippedList());
        this.sfx.equip();
      },
      respawn: () => this.loco.spawnAt(this.spawn.x, 0, this.spawn.z),
      toast: (msg) => this.hud.showToast(msg),
      onSettingChange: () => this._applySettings(),
      currentRoom: () => this.currentRoom,
      joinRoom: (code) => this._joinRoom(code),
      currentMap: () => this.currentMap,
      travel: (map) => this._travel(map),
      currentMode: () => this.gameModes.mode,
      setMode: (mode) => this._setMode(mode),
    };
  }

  _applySettings() {
    this.sfx.setEnabled(this.settings.sfx);
    this.vignette.visible = this.settings.vignette;
    for (const [, p] of this.remotePlayers.players) {
      p.avatar.nameTag.visible = this.settings.nameTags;
    }
  }

  // --- map + panels -------------------------------------------------------
  _loadMap(name) {
    // Clear previous panels + visuals.
    for (const p of this.panels) {
      p.mesh.parent?.remove(p.mesh);
    }
    this.panels = [];
    this.panelMeshes = [];
    if (this._mapGroup) {
      this.scene.remove(this._mapGroup);
      disposeGroup(this._mapGroup);
    }

    const result = buildMap(name, this.scene, this.world);
    this._mapGroup = result.group;
    this.spawn = result.spawn;
    // Walk-through travel portals (tunnel ends in the stump, arches elsewhere).
    this.portals = result.interactables.filter((it) => it.type === "portal");
    this._portalCooldownUntil = performance.now() + 2000;
    this.hemi.color.setHex(result.ambient);
    this.hemi.groundColor.setHex(result.dark ? 0x1a2026 : 0x35502f);
    this.hemi.intensity = result.dark ? 0.85 : 0.95;
    this.sun.color.setHex(result.sun);
    this.sun.intensity = result.dark ? 0.7 : 1.5;

    // Spawn inside the map (inside the stump on forest).
    this.loco.spawnAt(this.spawn.x, 0, this.spawn.z);

    // Build interactive panels attached to their mounts.
    const ctx = this._ctx();
    for (const it of result.interactables) {
      let panel = null;
      if (it.type === "computer") panel = new ComputerPanel(ctx);
      else if (it.type === "inventory") panel = new InventoryPanel(ctx);
      else if (it.type === "shop") panel = new ShopPanel(ctx, it.label || "Shop");
      if (!panel) continue;
      // Fit the panel plane to the mount's declared screen size.
      if (it.screenSize) {
        panel.mesh.scale.set(
          it.screenSize.w / panel.mesh.geometry.parameters.width,
          it.screenSize.h / panel.mesh.geometry.parameters.height,
          1
        );
      }
      it.mount.add(panel.mesh);
      this.panels.push(panel);
      this.panelMeshes.push(panel.mesh);
    }
    this._applySettings();
  }

  // --- network ------------------------------------------------------------
  _wireNetwork() {
    const n = this.network;
    n.on("welcome", (msg) => {
      this.gameModes.setLocalId(msg.id);
      this.gameModes.applyInfected(msg.infected, msg.mode);
      for (const p of msg.players || []) this.remotePlayers.ensure(p.id, p.name);
      const count = (msg.players || []).length;
      this.hud.showToast(
        count > 0
          ? "Connected — " + count + " other" + (count === 1 ? "" : "s") + " here"
          : "Connected — room \"" + this.currentRoom + "\""
      );
      this._applySettings();
    });
    n.on("join", (msg) => this.remotePlayers.onJoin(msg));
    n.on("leave", (msg) => this.remotePlayers.onLeave(msg));
    n.on("state", (msg) => this.remotePlayers.onState(msg));
    n.on("rename", (msg) => this.remotePlayers.onRename(msg));
    n.on("mode", (msg) => {
      this.gameModes.applyInfected(msg.infected, msg.mode);
      this.gameModes.setMode(msg.mode);
      this.hud.showToast(
        msg.mode === "infection" ? "Infection round started!" : "Casual mode"
      );
    });
    n.on("tagged", (msg) => {
      this.gameModes.applyInfected(msg.infected, "infection");
      this.sfx.tag();
      if (msg.by === this.gameModes.localId) {
        this.inventory.addCoins(CONFIG.tagBonus);
        this.hud.showToast("You tagged someone! +" + CONFIG.tagBonus + " coins");
        this._refreshEconomyPanels();
      } else if (msg.target === this.gameModes.localId) {
        this.hud.showToast("You got infected! You're IT 🔴");
      }
    });
    n.on("offline", () => {
      this.hud.showToast("No server — playing solo");
    });
    n.on("close", () => {
      this.hud.showToast("Disconnected — solo");
    });
  }

  // --- loop ---------------------------------------------------------------
  _loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.input.update();

    if (!this.input.isVR) {
      this.camera.position.copy(this.input.head.pos);
      this.camera.quaternion.copy(this.input.head.quat);
    }

    this.loco.update(dt);
    this._updatePortals();
    this._updateLocalAvatar();
    this.remotePlayers.update(this.currentMap);
    this.gameModes.update(this.rig);
    this._updatePointer();
    this._updateComfort();
    this._updateEconomy(dt);
    this._maybeSendState();

    this.renderer.render(this.scene, this.camera);
  }

  _updateLocalAvatar() {
    const h = this.input.hands;
    this.localAvatar.setPose({
      head: { pos: this.input.head.pos, quat: this.input.head.quat },
      hands: {
        left: {
          pos: h.left.pos,
          quat: h.left.quat,
          trigger: h.left.trigger,
          grip: h.left.grip,
          thumb: h.left.thumb,
        },
        right: {
          pos: h.right.pos,
          quat: h.right.quat,
          trigger: h.right.trigger,
          grip: h.right.grip,
          thumb: h.right.thumb,
        },
      },
    });
    // Keep local infected tint on your own name tag (visible to others via net).
    this.localAvatar.setInfected(this.gameModes.localInfected);
  }

  _updatePointer() {
    if (this.panelMeshes.length === 0) {
      this.cursor.visible = false;
      this.laser.visible = false;
      this.hovered = null;
      return;
    }

    let origin = _v1;
    let dir = _v2;
    let triggerDown = false;

    if (this.input.isVR) {
      const hand = this.input.hands[this.settings.dominant];
      if (!hand.active) {
        this.cursor.visible = false;
        this.laser.visible = false;
        this.hovered = null;
        return;
      }
      this.rig.localToWorld(origin.copy(hand.pos));
      dir.set(0, 0, -1).applyQuaternion(hand.quat).normalize();
      triggerDown = hand.trigger > 0.6;
    } else {
      this.camera.getWorldPosition(origin);
      this.camera.getWorldDirection(dir);
    }

    this.raycaster.set(origin, dir);
    const hits = this.raycaster.intersectObjects(this.panelMeshes, false);
    if (hits.length) {
      const hit = hits[0];
      this.cursor.position.copy(hit.point);
      this.cursor.visible = true;
      this.hovered = { panel: hit.object.userData.panel, uv: hit.uv };
      if (this.input.isVR) {
        this.laser.visible = true;
        this.laser.position.copy(origin);
        this.laser.quaternion.copy(this.input.hands[this.settings.dominant].quat);
        this.laser.scale.set(1, 1, hit.distance);
      }
    } else {
      this.cursor.visible = false;
      this.laser.visible = false;
      this.hovered = null;
    }

    // Click handling.
    let click = false;
    if (this.input.isVR) {
      if (triggerDown && !this._triggerWasDown) click = true;
      this._triggerWasDown = triggerDown;
    } else if (this._clickQueued) {
      click = true;
    }
    this._clickQueued = false;

    if (click && this.hovered && this.hovered.uv) {
      this.hovered.panel.clickAtUV(this.hovered.uv.x, this.hovered.uv.y);
      this.sfx.grab();
      this._pulse();
    }
  }

  _pulse() {
    const hand = this.input.hands[this.settings.dominant];
    const gp = hand.source?.gamepad;
    const act = gp?.hapticActuators?.[0];
    if (act && act.pulse) {
      try {
        act.pulse(0.4, 40);
      } catch {}
    }
  }

  /** Walking into a glowing portal travels to its destination map. */
  _updatePortals() {
    if (!this.portals || this.portals.length === 0) return;
    const now = performance.now();
    if (now < this._portalCooldownUntil) return;
    const rx = this.rig.position.x;
    const rz = this.rig.position.z;
    for (const p of this.portals) {
      const dx = rx - p.position.x;
      const dz = rz - p.position.z;
      if (dx * dx + dz * dz < p.radius * p.radius) {
        this.sfx.buy();
        this._travel(p.dest);
        return; // _loadMap replaced this.portals; stop iterating
      }
    }
  }

  _updateComfort() {
    // Keep the vignette planted in front of the head.
    this.rig.localToWorld(_v1.copy(this.input.head.pos));
    this.comfort.position.copy(_v1);
    this.comfort.quaternion.copy(this.input.head.quat); // rig unrotated
  }

  _updateEconomy(dt) {
    this._coinTimer += dt;
    if (this._coinTimer >= CONFIG.trickleInterval) {
      this._coinTimer = 0;
      this.inventory.addCoins(CONFIG.coinTrickle);
      this.sfx.coin();
      this._refreshEconomyPanels();
    }
  }

  _refreshEconomyPanels() {
    for (const p of this.panels) {
      if (p instanceof ShopPanel || p instanceof InventoryPanel) p.redraw();
    }
  }

  _maybeSendState() {
    if (!this.network.connected) return;
    const now = performance.now();
    if (now - this._lastNetSend < 1000 / CONFIG.netSendHz) return;
    this._lastNetSend = now;
    const h = this.input.hands;
    this.network.sendState({
      p: [this.rig.position.x, this.rig.position.y, this.rig.position.z],
      hd: packTransform(this.input.head.pos, this.input.head.quat),
      hl: packHand(h.left),
      hr: packHand(h.right),
      c: this.inventory.color,
      n: this.inventory.name,
      cos: this.inventory.equippedList(),
      m: this.currentMap,
      inf: this.gameModes.localInfected ? 1 : 0,
    });
  }

  _onResize() {
    if (this.renderer.xr.isPresenting) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
}

// --- helpers ---------------------------------------------------------------

function packTransform(pos, quat) {
  return [pos.x, pos.y, pos.z, quat.x, quat.y, quat.z, quat.w];
}

function packHand(h) {
  return [
    h.pos.x,
    h.pos.y,
    h.pos.z,
    h.quat.x,
    h.quat.y,
    h.quat.z,
    h.quat.w,
    round2(h.trigger),
    round2(h.grip),
    round2(h.thumb),
  ];
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

function makeVignetteTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(128, 128, 60, 128, 128, 128);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.7, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}

function disposeGroup(group) {
  group.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh) {
      o.geometry?.dispose();
      const m = o.material;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else m?.dispose();
    }
  });
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// Boot. The instance is exposed for debugging/automation only.
window.__game = new Game();
