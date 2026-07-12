// 2D HUD helpers (mode badge + transient toasts). Kept tiny and DOM-based so it
// works in the flat/desktop view; in VR the same messages are surfaced through
// panels + audio.

export class Hud {
  constructor() {
    this.root = document.getElementById("hud");
    this.badge = document.getElementById("modeBadge");
    this.toast = document.getElementById("toast");
    this._toastTimer = null;
  }

  show() {
    this.root.hidden = false;
  }

  hide() {
    this.root.hidden = true;
  }

  setModeBadge(text) {
    this.badge.textContent = text;
  }

  showToast(msg, ms = 2200) {
    this.toast.textContent = msg;
    this.toast.classList.add("show");
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toast.classList.remove("show"), ms);
  }
}
