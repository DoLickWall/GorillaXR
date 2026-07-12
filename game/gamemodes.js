// Game-mode controller.
//
//   casual    — free play, no tagging.
//   infection — the server seeds one "it"; infected players spread it by
//               touching clean players with a hand. Tag detection runs locally
//               and is confirmed by the authoritative GameRoom, so it can never
//               desync into an errored state; solo play simply has nobody to tag.

import * as THREE from "three";

const TAG_REACH = 0.7; // metres, hand-to-torso

export class GameModes {
  constructor({ input, network, remotePlayers, hud }) {
    this.input = input;
    this.network = network;
    this.remotePlayers = remotePlayers;
    this.hud = hud;
    this.mode = "casual";
    this.infected = new Set();
    this.localId = null;
    this._cooldownUntil = 0;
  }

  setLocalId(id) {
    this.localId = id;
  }

  setMode(mode) {
    this.mode = mode === "infection" ? "infection" : "casual";
    this._refreshBadge();
  }

  /** Called from network 'mode' + 'tagged' + 'welcome'. */
  applyInfected(ids, mode) {
    if (mode) this.mode = mode;
    this.infected = new Set(ids || []);
    this.remotePlayers.setInfectedSet([...this.infected]);
    this._refreshBadge();
  }

  get localInfected() {
    return this.localId != null && this.infected.has(this.localId);
  }

  _refreshBadge() {
    if (this.mode === "casual") {
      this.hud.setModeBadge("Casual");
      return;
    }
    if (this.localInfected) this.hud.setModeBadge("Infection — you are IT 🔴");
    else this.hud.setModeBadge("Infection — run! 🟢");
  }

  update(rig) {
    if (this.mode !== "infection" || !this.localInfected) return;
    const now = performance.now();
    if (now < this._cooldownUntil) return;

    // Check both hands against remote players' body centres.
    for (const side of ["left", "right"]) {
      const hand = this.input.hands[side];
      if (!hand.active) continue;
      _hw.copy(hand.pos);
      rig.localToWorld(_hw);
      const near = this.remotePlayers.nearest(_hw, TAG_REACH);
      if (near && !this.infected.has(near.id)) {
        this.network.sendTag(near.id);
        this._cooldownUntil = now + 800; // avoid spamming before server confirms
        this.hud.showToast("Tag sent!");
        return;
      }
    }
  }
}

const _hw = new THREE.Vector3();
