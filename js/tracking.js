// MediaPipe face + hand trackers and the live camera loop.
import { S, setStatus } from "./state.js";
import { head, updateHead } from "./head.js";
import { renderFrame } from "./render.js";

const MP = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";
const MODELS = "https://storage.googleapis.com/mediapipe-models/";
const FACE_MODEL = MODELS + "face_landmarker/face_landmarker/float16/1/face_landmarker.task";
const HAND_MODEL = MODELS + "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let faceTracker = null, handTracker = null;

/** Loads both trackers (GPU, falling back to CPU). Resolves to whether hand tracking is available. */
export async function loadTrackers() {
  const vision = await import(`${MP}/vision_bundle.mjs`);
  const files = await vision.FilesetResolver.forVisionTasks(`${MP}/wasm`);
  const make = (Task, path, opts) => async delegate =>
    Task.createFromOptions(files, { baseOptions: { modelAssetPath: path, delegate }, runningMode: "VIDEO", ...opts });
  const withFallback = async mk => { try { return await mk("GPU"); } catch { return mk("CPU"); } };

  faceTracker = await withFallback(make(vision.FaceLandmarker, FACE_MODEL,
    { numFaces: 1, outputFacialTransformationMatrixes: true, outputFaceBlendshapes: true }));
  try { handTracker = await withFallback(make(vision.HandLandmarker, HAND_MODEL, { numHands: 2 })); }
  catch { handTracker = null; }                            // the head view still works without hand tracking
  return !!handTracker;
}

export function liveLoop(video) {
  let lastTime = -1, lostAt = 0, said = "";
  const say = (t, c) => { if (said !== t) { said = t; setStatus(t, c); } };
  (function tick() {
    requestAnimationFrame(tick);
    if (video.readyState < 2 || video.currentTime === lastTime) return;
    lastTime = video.currentTime;
    const now = performance.now();
    let faceLms = null, hands = [], sides = [];
    try {
      const fr = faceTracker.detectForVideo(video, now);
      faceLms = fr.faceLandmarks?.[0];
      const mat = fr.facialTransformationMatrixes?.[0];
      if (faceLms && mat) {
        const cats = fr.faceBlendshapes?.[0]?.categories ?? [];
        updateHead(mat.data, faceLms, Object.fromEntries(cats.map(c => [c.categoryName, c.score])), now); lostAt = 0;
      } else { faceLms = null; lostAt ||= now; if (now - lostAt > 250) head.found = false; }
      if (handTracker && (S.hands || S.reveal === "lens" || S.showdata)) {
        const hr = handTracker.detectForVideo(video, now);
        hands = hr.landmarks || [];
        const hd = hr.handedness || hr.handednesses || [];
        // The tracker names hands as if the picture were mirrored; ours is not, so the names are swapped.
        sides = hands.map((_, i) => hd[i]?.[0]?.categoryName === "Left");
      }
    } catch (e) { say(`The tracker hit an error: ${e.message}`, "bad"); return; }
    say(head.found ? "Tracking your head." + (hands.length ? " Hand bones on." : "")
        : hands.length ? "Hand found. Face the camera to see inside your head."
        : "No face found. Face the camera, with light on your face.", head.found || hands.length ? "ok" : "bad");
    renderFrame(now, faceLms, hands, sides);
  })();
}
