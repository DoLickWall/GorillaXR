// Player profile + inventory: owned/equipped cosmetics, coins, name, colour and
// moderator flag. Persisted to localStorage so it survives reloads.

import { CONFIG } from "../config.js";
import { COSMETICS, COSMETIC_BY_ID } from "./cosmetics.js";

const STORAGE_KEY = "jungletag.profile.v1";

export class Inventory {
  constructor() {
    this.coins = CONFIG.startingCoins;
    this.owned = new Set();
    this.equipped = new Set();
    this.name = "Gorilla";
    this.color = CONFIG.defaultColor;
    this.isMod = false;
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      this.coins = Number.isFinite(data.coins) ? data.coins : this.coins;
      this.owned = new Set(Array.isArray(data.owned) ? data.owned : []);
      this.equipped = new Set(Array.isArray(data.equipped) ? data.equipped : []);
      this.name = typeof data.name === "string" ? data.name : this.name;
      this.color = Number.isFinite(data.color) ? data.color : this.color;
      this.isMod = !!data.isMod;
    } catch {
      /* corrupt profile — start fresh */
    }
  }

  save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          coins: this.coins,
          owned: [...this.owned],
          equipped: [...this.equipped],
          name: this.name,
          color: this.color,
          isMod: this.isMod,
        })
      );
    } catch {
      /* storage disabled — run in-memory only */
    }
  }

  setMod(v) {
    this.isMod = !!v;
    this.save();
  }

  /** Moderators implicitly own The Stick; otherwise only what was purchased. */
  owns(id) {
    const def = COSMETIC_BY_ID[id];
    if (!def) return false;
    if (def.modOnly) return this.isMod;
    return this.owned.has(id);
  }

  canBuy(id) {
    const def = COSMETIC_BY_ID[id];
    if (!def) return false;
    if (def.modOnly) return false; // not purchasable
    if (this.owns(id)) return false;
    return this.coins >= def.price;
  }

  buy(id) {
    if (!this.canBuy(id)) return false;
    const def = COSMETIC_BY_ID[id];
    this.coins -= def.price;
    this.owned.add(id);
    this.save();
    return true;
  }

  isEquipped(id) {
    return this.equipped.has(id);
  }

  toggleEquip(id) {
    if (!this.owns(id)) return false;
    const def = COSMETIC_BY_ID[id];
    if (this.equipped.has(id)) {
      this.equipped.delete(id);
    } else {
      // Exclusive slot: drop anything else in the same slot.
      for (const other of [...this.equipped]) {
        if (COSMETIC_BY_ID[other]?.slot === def.slot) this.equipped.delete(other);
      }
      this.equipped.add(id);
    }
    this.save();
    return true;
  }

  /** Equipped list filtered to things actually still owned (mod state changes). */
  equippedList() {
    return [...this.equipped].filter((id) => this.owns(id));
  }

  addCoins(n) {
    this.coins += n;
    this.save();
  }

  setName(name) {
    this.name = String(name || "Gorilla").slice(0, 16) || "Gorilla";
    this.save();
  }

  setColor(hex) {
    this.color = hex;
    this.save();
  }

  /** Catalog rows annotated with ownership/affordability for UIs. */
  catalog() {
    return COSMETICS.map((c) => ({
      ...c,
      owned: this.owns(c.id),
      equipped: this.isEquipped(c.id),
      affordable: this.canBuy(c.id),
      locked: !!c.modOnly && !this.isMod,
    }));
  }
}
