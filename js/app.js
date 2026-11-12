// Wires everything together. Loaded by main.js so a failed 3D-engine download can be reported nicely.
import { $, setStatus } from "./state.js";
import { buildScene, resize } from "./scene.js";
import { initUI } from "./ui.js";
import { loadTrackers, liveLoop } from "./tracking.js";
import { demoLoop } from "./demo.js";

initUI();
const video = $("video"), stage = $("stage");

async function start() {
  $("start").disabled = true;
  let step = "camera";
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("this browser will not give this page a camera. Try Chrome or Edge.");
    setStatus("Asking for the camera…");
    video.srcObject = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    await video.play();
    if (video.videoWidth && video.videoHeight) stage.style.setProperty("--ar", (video.videoWidth / video.videoHeight).toFixed(4));
    $("intro").hidden = true;
    step = "3D anatomy";
    setStatus("Loading the 3D anatomy…");
    buildScene();
    step = "trackers";
    setStatus("Loading the face and hand trackers (first time takes a few seconds)…");
    if (!await loadTrackers()) $("L_hands").disabled = true;
    resize();
    liveLoop(video);
  } catch (err) {
    $("start").disabled = false; $("intro").hidden = false;
    video.srcObject?.getTracks().forEach(t => t.stop());
    const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
    setStatus(denied ? "Camera blocked. Allow camera access for this page and click Start again."
                     : `Could not load the ${step}: ${err?.message ?? err}`, "bad");
  }
}

$("start").onclick = start;
if (location.hash === "#demo") {
  $("intro").hidden = true;
  setStatus("Demo scene (no camera).", "ok");
  buildScene(); demoLoop();
}
