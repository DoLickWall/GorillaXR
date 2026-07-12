// Thin WebSocket client for the Cloudflare GameRoom Durable Object.
//
// It emits events the game subscribes to and exposes senders for local state.
// If the socket can't be reached the game keeps running fully offline (solo),
// so a missing multiplayer backend is never fatal.

export class Network {
  constructor() {
    this.ws = null;
    this.id = null;
    this.connected = false;
    this.room = null;
    this._handlers = new Map();
    this._sendBuffer = null;
    this._lastSend = 0;
  }

  on(type, cb) {
    if (!this._handlers.has(type)) this._handlers.set(type, new Set());
    this._handlers.get(type).add(cb);
    return this;
  }

  _emit(type, data) {
    const set = this._handlers.get(type);
    if (set) for (const cb of set) cb(data);
  }

  connect(room, name) {
    this.room = room;
    const proto = location.protocol === "https:" ? "wss" : "ws";
    // Same-origin: works both on Cloudflare and `wrangler dev`.
    const url = `${proto}://${location.host}/ws?room=${encodeURIComponent(
      room
    )}&name=${encodeURIComponent(name)}`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      this._emit("offline", { reason: "construct-failed" });
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.connected = true;
      this._emit("open", {});
    });
    ws.addEventListener("message", (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      this._route(msg);
    });
    ws.addEventListener("close", () => {
      this.connected = false;
      this._emit("close", {});
    });
    ws.addEventListener("error", () => {
      // Most commonly: no backend (opened file directly / assets-only host).
      this._emit("offline", { reason: "socket-error" });
    });
  }

  _route(msg) {
    switch (msg.type) {
      case "welcome":
        this.id = msg.id;
        this._emit("welcome", msg);
        break;
      case "join":
        this._emit("join", msg);
        break;
      case "leave":
        this._emit("leave", msg);
        break;
      case "state":
        this._emit("state", msg);
        break;
      case "rename":
        this._emit("rename", msg);
        break;
      case "mode":
        this._emit("mode", msg);
        break;
      case "tagged":
        this._emit("tagged", msg);
        break;
      default:
        break;
    }
  }

  _raw(obj) {
    if (this.ws && this.connected) {
      try {
        this.ws.send(JSON.stringify(obj));
      } catch {
        /* dropped frame; fine for state */
      }
    }
  }

  sendState(payload) {
    payload.type = "state";
    this._raw(payload);
  }

  sendRename(name) {
    this._raw({ type: "rename", name });
  }

  setMode(mode) {
    this._raw({ type: "setMode", mode });
  }

  sendTag(target) {
    this._raw({ type: "tag", target });
  }

  disconnect() {
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.connected = false;
  }
}
