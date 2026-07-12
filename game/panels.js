// World-space interactive panels rendered to a canvas texture. You aim at them
// with a hand (VR) or the crosshair (desktop) and press to click. Shared base
// handles hit-testing; subclasses draw content and register buttons.
//
//   ComputerPanel  — change name (on-screen keyboard), colour, settings
//   InventoryPanel — equip owned cosmetics
//   ShopPanel      — buy cosmetics with coins

import * as THREE from "three";
import { COLOR_SWATCHES } from "../config.js";
import { COSMETICS } from "./cosmetics.js";

class WorldPanel {
  constructor(worldW, worldH, pxW, pxH) {
    this.pxW = pxW;
    this.pxH = pxH;
    this.canvas = document.createElement("canvas");
    this.canvas.width = pxW;
    this.canvas.height = pxH;
    this.ctx = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.anisotropy = 8;
    const mat = new THREE.MeshBasicMaterial({ map: this.texture });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldH), mat);
    this.mesh.userData.panel = this;
    this.buttons = [];
    this.open = false;
  }

  addButton(x, y, w, h, onClick, meta = {}) {
    this.buttons.push({ x, y, w, h, onClick, ...meta });
  }

  clearButtons() {
    this.buttons.length = 0;
  }

  clickAtUV(u, v) {
    const cx = u * this.pxW;
    const cy = (1 - v) * this.pxH;
    for (let i = this.buttons.length - 1; i >= 0; i--) {
      const b = this.buttons[i];
      if (cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h) {
        b.onClick();
        return true;
      }
    }
    return false;
  }

  commit() {
    this.texture.needsUpdate = true;
  }

  // ---- drawing helpers ----
  bg(color = "#0e1f14") {
    const c = this.ctx;
    c.fillStyle = color;
    c.fillRect(0, 0, this.pxW, this.pxH);
    c.strokeStyle = "#2b5236";
    c.lineWidth = 6;
    c.strokeRect(3, 3, this.pxW - 6, this.pxH - 6);
  }

  roundRect(x, y, w, h, r) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  button(label, x, y, w, h, onClick, opts = {}) {
    const c = this.ctx;
    this.roundRect(x, y, w, h, opts.r ?? 10);
    c.fillStyle = opts.fill ?? "#1c3a26";
    c.fill();
    if (opts.border !== false) {
      c.lineWidth = 2;
      c.strokeStyle = opts.stroke ?? "#3f7a4f";
      c.stroke();
    }
    c.fillStyle = opts.color ?? "#eaf5ea";
    c.font = opts.font ?? "bold 22px Segoe UI, Arial";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(label, x + w / 2, y + h / 2 + 1);
    if (onClick) this.addButton(x, y, w, h, onClick);
  }

  title(text, y = 40) {
    const c = this.ctx;
    c.fillStyle = "#7dd66d";
    c.font = "bold 30px Segoe UI, Arial";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, this.pxW / 2, y);
  }
}

// --- Computer ---------------------------------------------------------------

const KEY_ROWS = ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];

export class ComputerPanel extends WorldPanel {
  constructor(ctx) {
    super(0.72, 0.56, 640, 500);
    this.ctx2 = ctx; // game context (applyName/applyColor/joinRoom/travel/...)
    this.tab = "name";
    this.nameBuffer = ctx.inventory.name;
    this.roomBuffer = "";
    this.redraw();
  }

  redraw() {
    this.clearButtons();
    this.bg("#0b1a10");
    this.title("STUMP OS v1.0", 30);
    // Two rows of three tabs.
    const tabs = [
      ["NAME", "name"],
      ["COLOUR", "color"],
      ["ROOM", "room"],
      ["MAP", "map"],
      ["MODE", "mode"],
      ["SETTINGS", "settings"],
    ];
    const tw = 194,
      th = 34;
    tabs.forEach((t, i) => {
      const x = 20 + (i % 3) * (tw + 9);
      const y = 52 + Math.floor(i / 3) * (th + 8);
      this.button(
        t[0],
        x,
        y,
        tw,
        th,
        () => {
          this.tab = t[1];
          this.redraw();
        },
        {
          fill: this.tab === t[1] ? "#2f6a3c" : "#16301f",
          r: 8,
          font: "bold 17px Segoe UI",
        }
      );
    });

    if (this.tab === "name") this._drawTyping("Your name", this.nameBuffer, "SAVE");
    else if (this.tab === "room") this._drawTyping("Room code", this.roomBuffer, "JOIN");
    else if (this.tab === "color") this._drawColor();
    else if (this.tab === "map") this._drawMap();
    else if (this.tab === "mode") this._drawMode();
    else this._drawSettings();
    this.commit();
  }

  _drawTyping(label, value, action) {
    const c = this.ctx;
    c.fillStyle = "#9fc4a4";
    c.font = "15px Segoe UI";
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillText(
      this.tab === "room"
        ? label + "  (currently: " + this.ctx2.currentRoom() + ")"
        : label,
      34,
      148
    );
    // typed value display
    this.roundRect(30, 160, 580, 44, 10);
    c.fillStyle = "#06120a";
    c.fill();
    c.strokeStyle = "#3f7a4f";
    c.lineWidth = 2;
    c.stroke();
    c.fillStyle = "#eaf5ea";
    c.font = "bold 26px Segoe UI, Arial";
    c.fillText((value || "") + "_", 46, 183);
    // keyboard (digits + letters)
    const keyW = 54,
      keyH = 40,
      gap = 6;
    let y = 214;
    for (const row of KEY_ROWS) {
      const rowW = row.length * (keyW + gap) - gap;
      let x = (this.pxW - rowW) / 2;
      for (const ch of row) {
        this.button(ch, x, y, keyW, keyH, () => this._type(ch), {
          r: 8,
          font: "bold 20px Segoe UI",
        });
        x += keyW + gap;
      }
      y += keyH + gap;
    }
    // bottom row: space / del / action
    this.button("SPACE", 110, y, 190, keyH, () => this._type(" "), { r: 8 });
    this.button("DEL", 310, y, 90, keyH, () => this._type("\b"), {
      r: 8,
      fill: "#5a2626",
    });
    this.button(action, 410, y, 130, keyH, () => this._commitTyping(), {
      r: 8,
      fill: "#2f6a3c",
    });
  }

  _type(ch) {
    const isRoom = this.tab === "room";
    const cur = isRoom ? this.roomBuffer : this.nameBuffer;
    let next = cur;
    if (ch === "\b") next = cur.slice(0, -1);
    else if (cur.length < (isRoom ? 20 : 16)) next = cur + ch;
    if (isRoom) this.roomBuffer = next;
    else this.nameBuffer = next;
    this.redraw();
  }

  _commitTyping() {
    if (this.tab === "room") {
      const code = this.roomBuffer.trim().toLowerCase().replace(/\s+/g, "-");
      if (!code) return;
      this.ctx2.joinRoom(code);
      this.roomBuffer = "";
    } else {
      const name = this.nameBuffer.trim() || "Gorilla";
      this.ctx2.applyName(name);
      this.ctx2.toast("Name saved: " + name);
    }
    this.redraw();
  }

  _drawColor() {
    const c = this.ctx;
    c.fillStyle = "#9fc4a4";
    c.font = "16px Segoe UI";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Pick your fur colour — applies instantly", this.pxW / 2, 152);
    const cols = 7;
    const sw = 72,
      sh = 72,
      gap = 12;
    const totalW = cols * (sw + gap) - gap;
    let x0 = (this.pxW - totalW) / 2;
    COLOR_SWATCHES.forEach((hex, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = x0 + col * (sw + gap);
      const y = 176 + row * (sh + gap);
      this.roundRect(x, y, sw, sh, 12);
      c.fillStyle = "#" + hex.toString(16).padStart(6, "0");
      c.fill();
      const selected = this.ctx2.inventory.color === hex;
      c.lineWidth = selected ? 5 : 2;
      c.strokeStyle = selected ? "#ffffff" : "#2b5236";
      c.stroke();
      this.addButton(x, y, sw, sh, () => {
        this.ctx2.applyColor(hex);
        this.redraw();
      });
    });
  }

  _drawMap() {
    const c = this.ctx;
    c.fillStyle = "#9fc4a4";
    c.font = "16px Segoe UI";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Travel to another map", this.pxW / 2, 152);
    const maps = [
      ["FOREST — spawn stump & gazebo", "forest"],
      ["CAVES — crystals in the dark", "caves"],
      ["CITY — shops & rooftops", "city"],
    ];
    let y = 178;
    for (const [label, id] of maps) {
      const here = this.ctx2.currentMap() === id;
      this.button(
        here ? label + "  ✓" : label,
        60,
        y,
        520,
        66,
        () => {
          this.ctx2.travel(id);
          this.redraw();
        },
        { r: 12, fill: here ? "#2f6a3c" : "#16301f", font: "bold 21px Segoe UI" }
      );
      y += 80;
    }
    c.fillStyle = "#9fc4a4";
    c.font = "14px Segoe UI";
    c.fillText("Friends in your room see which map you're on", this.pxW / 2, y + 14);
  }

  _drawMode() {
    const c = this.ctx;
    c.fillStyle = "#9fc4a4";
    c.font = "16px Segoe UI";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("Game mode (applies to the whole room)", this.pxW / 2, 152);
    const modes = [
      ["CASUAL — hang out, no tag", "casual"],
      ["INFECTION — one is IT, touch spreads it", "infection"],
    ];
    let y = 184;
    for (const [label, id] of modes) {
      const active = this.ctx2.currentMode() === id;
      this.button(
        active ? label + "  ✓" : label,
        60,
        y,
        520,
        76,
        () => {
          this.ctx2.setMode(id);
          this.redraw();
        },
        { r: 12, fill: active ? "#2f6a3c" : "#16301f", font: "bold 20px Segoe UI" }
      );
      y += 92;
    }
    c.fillStyle = "#9fc4a4";
    c.font = "14px Segoe UI";
    c.fillText("Infection needs at least 2 players in the room", this.pxW / 2, y + 14);
  }

  _drawSettings() {
    const s = this.ctx2.settings;
    const rows = [
      ["Dominant hand: " + (s.dominant === "right" ? "RIGHT" : "LEFT"), () => {
        s.dominant = s.dominant === "right" ? "left" : "right";
        this.ctx2.onSettingChange();
        this.redraw();
      }],
      ["Comfort vignette: " + (s.vignette ? "ON" : "OFF"), () => {
        s.vignette = !s.vignette;
        this.ctx2.onSettingChange();
        this.redraw();
      }],
      ["Name tags: " + (s.nameTags ? "ON" : "OFF"), () => {
        s.nameTags = !s.nameTags;
        this.ctx2.onSettingChange();
        this.redraw();
      }],
      ["Sound effects: " + (s.sfx ? "ON" : "OFF"), () => {
        s.sfx = !s.sfx;
        this.ctx2.onSettingChange();
        this.redraw();
      }],
    ];
    let y = 150;
    for (const [label, fn] of rows) {
      this.button(label, 40, y, 560, 48, fn, { r: 10, font: "bold 20px Segoe UI" });
      y += 58;
    }
    this.button("RESPAWN", 40, y + 4, 560, 48, () => this.ctx2.respawn(), {
      r: 10,
      fill: "#2f6a3c",
    });
  }
}

// --- Inventory --------------------------------------------------------------

export class InventoryPanel extends WorldPanel {
  constructor(ctx) {
    super(0.92, 0.72, 720, 560);
    this.ctx2 = ctx;
    this.redraw();
  }

  redraw() {
    this.clearButtons();
    this.bg("#0b1a10");
    this.title("INVENTORY", 40);
    const c = this.ctx;
    c.fillStyle = "#ffd24a";
    c.font = "bold 20px Segoe UI";
    c.textAlign = "right";
    c.fillText("🪙 " + this.ctx2.inventory.coins, this.pxW - 24, 40);

    const items = this.ctx2.inventory.catalog();
    const cols = 2;
    const cw = 330,
      ch = 84,
      gapx = 24,
      gapy = 16;
    const x0 = (this.pxW - (cols * cw + (cols - 1) * gapx)) / 2;
    items.forEach((it, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = x0 + col * (cw + gapx);
      const y = 80 + row * (ch + gapy);
      this._drawItemRow(it, x, y, cw, ch);
    });
    this.commit();
  }

  _drawItemRow(it, x, y, w, h) {
    const c = this.ctx;
    this.roundRect(x, y, w, h, 12);
    c.fillStyle = it.owned ? "#16301f" : "#141d18";
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = it.equipped ? "#7dd66d" : "#2b5236";
    c.stroke();
    c.fillStyle = it.locked ? "#7f8c82" : "#eaf5ea";
    c.font = "bold 22px Segoe UI";
    c.textAlign = "left";
    c.textBaseline = "top";
    c.fillText(it.name, x + 16, y + 14);
    c.font = "15px Segoe UI";
    c.fillStyle = "#9fc4a4";
    const sub = it.locked
      ? "Moderator only"
      : it.owned
      ? it.equipped
        ? "Equipped"
        : "Owned"
      : "Buy in the city (" + it.price + ")";
    c.fillText(sub, x + 16, y + 46);

    if (it.owned) {
      const bw = 110,
        bh = 44;
      const bx = x + w - bw - 14,
        by = y + (h - bh) / 2;
      this.button(
        it.equipped ? "UNEQUIP" : "EQUIP",
        bx,
        by,
        bw,
        bh,
        () => {
          this.ctx2.inventory.toggleEquip(it.id);
          this.ctx2.applyCosmetics();
          this.redraw();
        },
        { r: 8, fill: it.equipped ? "#5a2626" : "#2f6a3c", font: "bold 18px Segoe UI" }
      );
    }
  }
}

// --- Shop -------------------------------------------------------------------

export class ShopPanel extends WorldPanel {
  constructor(ctx, label = "SHOP") {
    super(0.82, 0.82, 640, 640);
    this.ctx2 = ctx;
    this.label = label;
    this.redraw();
  }

  redraw() {
    this.clearButtons();
    this.bg("#0b1a10");
    this.title(this.label.toUpperCase(), 40);
    const c = this.ctx;
    c.fillStyle = "#ffd24a";
    c.font = "bold 20px Segoe UI";
    c.textAlign = "center";
    c.fillText("Coins: " + this.ctx2.inventory.coins, this.pxW / 2, 70);

    const buyable = COSMETICS.filter((x) => !x.modOnly);
    const rowH = 74,
      gap = 12;
    let y = 96;
    for (const def of buyable) {
      const inv = this.ctx2.inventory;
      const owned = inv.owns(def.id);
      const afford = inv.canBuy(def.id);
      this.roundRect(30, y, this.pxW - 60, rowH, 12);
      c.fillStyle = "#16301f";
      c.fill();
      c.strokeStyle = "#2b5236";
      c.lineWidth = 2;
      c.stroke();
      c.fillStyle = "#eaf5ea";
      c.font = "bold 22px Segoe UI";
      c.textAlign = "left";
      c.textBaseline = "middle";
      c.fillText(def.name, 50, y + rowH / 2);

      const bw = 150,
        bh = 48;
      const bx = this.pxW - 30 - bw - 16,
        by = y + (rowH - bh) / 2;
      if (owned) {
        this.button("OWNED", bx, by, bw, bh, null, { fill: "#22331f", color: "#7dd66d" });
      } else {
        this.button(
          "BUY  " + def.price,
          bx,
          by,
          bw,
          bh,
          () => {
            if (this.ctx2.inventory.buy(def.id)) {
              this.ctx2.toast("Bought " + def.name + "!");
            } else {
              this.ctx2.toast("Not enough coins");
            }
            this.redraw();
          },
          { fill: afford ? "#2f6a3c" : "#3a2b2b", color: afford ? "#eaf5ea" : "#a98" }
        );
      }
      y += rowH + gap;
    }
    c.fillStyle = "#9fc4a4";
    c.font = "15px Segoe UI";
    c.textAlign = "center";
    c.fillText("Equip purchases at an inventory stand", this.pxW / 2, y + 20);
    this.commit();
  }
}
