// Minimal WebXR session button (avoids depending on three's addons path). Falls
// back gracefully with a readable message when VR isn't available.

export function createVRButton(renderer, { onStart, onEnd } = {}) {
  const btn = document.createElement("button");
  btn.className = "secondary";
  btn.textContent = "Checking VR…";
  btn.disabled = true;

  let currentSession = null;

  const sessionInit = {
    optionalFeatures: [
      "local-floor",
      "bounded-floor",
      "hand-tracking",
      "layers",
    ],
  };

  async function startSession() {
    try {
      const session = await navigator.xr.requestSession("immersive-vr", sessionInit);
      currentSession = session;
      session.addEventListener("end", () => {
        currentSession = null;
        btn.textContent = "Enter VR";
        onEnd?.();
      });
      await renderer.xr.setSession(session);
      btn.textContent = "Exit VR";
      onStart?.();
    } catch (err) {
      btn.textContent = "VR failed — retry";
      console.warn("Failed to start XR session:", err);
    }
  }

  btn.addEventListener("click", () => {
    if (currentSession) currentSession.end();
    else startSession();
  });

  if (!("xr" in navigator)) {
    btn.textContent = "VR not supported";
    btn.disabled = true;
    return btn;
  }

  navigator.xr
    .isSessionSupported("immersive-vr")
    .then((supported) => {
      if (supported) {
        btn.textContent = "Enter VR";
        btn.disabled = false;
      } else {
        btn.textContent = "VR headset not found";
        btn.disabled = true;
      }
    })
    .catch(() => {
      btn.textContent = "VR unavailable";
      btn.disabled = true;
    });

  return btn;
}
