// One frame: hand veil + bones, layers, optional x-ray lens, 3D draw, then the heads-up layer.
import * as THREE from "three";
import { $, S, LAYERS, view, TAU } from "./state.js";
import { gfx, applyLayers } from "./scene.js";
import { head } from "./head.js";
import { updateHand, drawHandVeil } from "./hands.js";
import { drawLabels } from "./labels.js";

const HAND_LINKS = [[0,1,2,3,4],[0,5,6,7,8],[5,9,10,11,12],[9,13,14,15,16],[13,17,18,19,20],[0,17]];
let pointer = null, frames = 0, fps = 0, fpsAt = 0, dataAt = 0;
const stage = $("stage");
stage.addEventListener("pointermove", e => { const r = stage.getBoundingClientRect(); pointer = { x: e.clientX - r.left, y: e.clientY - r.top }; });
stage.addEventListener("pointerleave", () => { pointer = null; });

function lensFor(faceLms, hands) {
  const { W, H } = view;
  let cx, cy;                                              // in the canvas's own (unmirrored) pixel space
  if (hands[0]) { cx = hands[0][8].x * W; cy = hands[0][8].y * H; }
  else if (pointer) { cx = W - pointer.x; cy = pointer.y; }
  else if (faceLms) { cx = faceLms[1].x * W; cy = faceLms[1].y * H; }
  else { cx = W / 2; cy = H / 2; }
  return { cx, cy, rad: (0.07 + 0.38 * S.cut) * W };
}

function drawTrackingData(g, now, faceLms, hands, sides) {
  const { W, H } = view;
  if (faceLms) { g.fillStyle = "rgba(127,255,170,.85)"; for (const p of faceLms) g.fillRect((1 - p.x) * W - 1, p.y * H - 1, 2, 2); }
  g.strokeStyle = "rgba(255,183,3,.9)"; g.fillStyle = "#ffb703"; g.lineWidth = 1.5;
  for (const lms of hands) {
    for (const c of HAND_LINKS) {
      g.beginPath(); c.forEach((i, k) => { const x = (1 - lms[i].x) * W, y = lms[i].y * H; k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    }
    for (const p of lms) { g.beginPath(); g.arc((1 - p.x) * W, p.y * H, 3, 0, TAU); g.fill(); }
  }
  if (now - dataAt < 120) return;
  dataAt = now;
  const pad = k => k.padEnd(18), rows = [];
  if (head.found) {
    const eu = new THREE.Euler().setFromQuaternion(head.quat, "YXZ"), deg = r => `${Math.round(THREE.MathUtils.radToDeg(r))}°`;
    rows.push(["face", `tracked, ${faceLms ? faceLms.length : 0} points`],
              ["distance", `${(-head.pos.z).toFixed(0)} cm (estimate)`],
              ["turn / nod / tilt", `${deg(eu.y)} / ${deg(eu.x)} / ${deg(eu.z)}`],
              ["jaw open", head.jaw.toFixed(2)],
              ["screen fit", `scale ${head.fitS.toFixed(3)}, shift ${head.fitX.toFixed(3)}, ${head.fitY.toFixed(3)}`]);
  } else rows.push(["face", "not found"]);
  rows.push(["hands", hands.length ? hands.map((_, i) => sides[i] ? "right" : "left").join(" + ") : "none"]);
  if (hands[0]) rows.push(["index fingertip", `${(1 - hands[0][8].x).toFixed(2)}, ${hands[0][8].y.toFixed(2)}`]);
  rows.push(["layers", LAYERS.filter(k => S[k]).join(", ") || "none"], ["speed", `${fps} frames/s`]);
  $("data").textContent = rows.map(r => pad(r[0]) + r[1]).join("\n");
}

export function renderFrame(now, faceLms, hands, sides) {
  const { W, H } = view, { renderer, headScene, handScene, cam, ortho, headGroup } = gfx;
  const sg = $("shade").getContext("2d"); sg.clearRect(0, 0, W, H);
  // Keep each physical hand on the same rig (by left/right label) so filters never blend two hands together.
  const slot = [null, null];
  hands.forEach((lms, i) => { let k = sides[i] ? 1 : 0; if (slot[k]) k = 1 - k; if (!slot[k]) slot[k] = { lms, right: !!sides[i] }; });
  gfx.handRigs.forEach((rig, i) => {
    const h = slot[i];
    if (h && S.hands) {
      updateHand(rig, h.lms, h.right, now);
      drawHandVeil(sg, rig.pts, (1 - S.real) * 0.92);
      const gain = S.style === "solid" ? Math.min(1.25, 0.6 + 0.4 * S.bright) : S.bright * 1.15;
      for (const m of [rig.palm, ...rig.bones]) { m.material.uniforms.uGain.value = gain; m.material.uniforms.uFeather.value = S.feather * 0.75; }
    } else rig.group.visible = false;
  });
  if (!head.found) headGroup.visible = false;
  applyLayers();

  // x-ray lens: a round window; outside it you see the plain camera picture
  let mask = "none", lens = null;
  if (S.reveal === "lens") {
    const { cx, cy, rad } = lensFor(faceLms, hands);
    mask = `radial-gradient(circle ${rad.toFixed(1)}px at ${cx.toFixed(1)}px ${cy.toFixed(1)}px, #000 ${(98 - 78 * S.feather).toFixed(0)}%, transparent 100%)`;
    lens = { x: W - cx, y: cy, r: rad };
  }
  for (const id of ["gl", "shade"]) { const st = $(id).style; st.maskImage = mask; st.webkitMaskImage = mask; }

  renderer.clear();
  renderer.render(headScene, cam);
  renderer.clearDepth();
  renderer.render(handScene, ortho);

  // heads-up layer: lens ring, labels, and the tracking points when switched on
  const g = $("hud").getContext("2d"); g.clearRect(0, 0, W, H);
  if (lens) { g.strokeStyle = "rgba(127,209,255,.8)"; g.lineWidth = 2; g.beginPath(); g.arc(lens.x, lens.y, lens.r, 0, TAU); g.stroke(); }
  if (S.labels) drawLabels(g, lens);
  if (S.showdata) drawTrackingData(g, now, faceLms, hands, sides);
  frames++;
  if (now - fpsAt >= 1000) { fps = Math.round(frames * 1000 / (now - fpsAt)); frames = 0; fpsAt = now; }
}
