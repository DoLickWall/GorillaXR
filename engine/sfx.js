// Tiny WebAudio SFX. Synthesised so there are no asset files to ship. All calls
// are no-ops until the first user gesture unlocks audio, and respect the
// player's sound setting.

export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  _ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
  }

  unlock() {
    this._ensure();
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  setEnabled(v) {
    this.enabled = !!v;
  }

  _blip(freq, dur, type = "sine", gain = 0.12) {
    if (!this.enabled) return;
    this._ensure();
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  grab() {
    this._blip(180, 0.08, "triangle", 0.05);
  }
  buy() {
    this._blip(660, 0.09, "sine", 0.1);
    setTimeout(() => this._blip(990, 0.12, "sine", 0.1), 90);
  }
  equip() {
    this._blip(520, 0.08, "square", 0.06);
  }
  tag() {
    this._blip(300, 0.12, "sawtooth", 0.12);
    setTimeout(() => this._blip(200, 0.18, "sawtooth", 0.12), 100);
  }
  coin() {
    this._blip(880, 0.06, "sine", 0.06);
  }
}
