// Hand bones: place each bone mesh between its two tracked joints, plus a dark veil over the real hand.
import * as THREE from "three";
import { S, view } from "./state.js";
import { OneEuro, cutoffFor } from "./filters.js";
import { BONES, gfx } from "./scene.js";

const v = new THREE.Vector3(), vA = new THREE.Vector3(), vB = new THREE.Vector3(), vC = new THREE.Vector3();
const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), e3 = new THREE.Vector3(), hm = new THREE.Matrix4();

export function updateHand(rig, lms, isRight, now) {
  const { W, H } = view;
  // tracker coordinates -> stage pixels, with depth scaled like x (closer to the camera = larger z)
  if (!rig.pts) { rig.pts = lms.map(() => new THREE.Vector3()); rig.f = lms.map(() => [0, 1, 2].map(() => new OneEuro(0.01))); }
  if (!rig.group.visible) rig.f.forEach(a => a.forEach(f => f.reset()));          // hand just appeared: start from the raw pose
  const t = now / 1000, mc = cutoffFor(S.smooth);
  lms.forEach((l, i) => { const f = rig.f[i]; rig.pts[i].set(f[0].step(l.x * W, t, mc), f[1].step((1 - l.y) * H, t, mc), f[2].step(-l.z * W, t, mc)); });
  const P = rig.pts, sign = isRight ? 1 : -1;
  // palm block (wrist bones + the four finger metacarpals) follows wrist, index knuckle and little-finger knuckle
  e1.subVectors(P[5], P[0]); e2.subVectors(P[17], P[0]);
  e3.crossVectors(e1, e2).normalize().multiplyScalar(sign * Math.sqrt(e1.length() * e2.length()));
  rig.palm.matrix.makeBasis(e1, e2, e3).setPosition(P[0]);
  rig.palm.matrixWorldNeedsUpdate = true;
  // every finger bone spans two tracked joints; its roll comes from the line across the knuckles
  vC.subVectors(P[17], P[5]).normalize();
  BONES.forEach(([a, b], i) => {
    vA.subVectors(P[b], P[a]);
    const len = Math.max(vA.length(), 1e-6);
    vA.divideScalar(len);
    vB.copy(vC).addScaledVector(vA, -vC.dot(vA));
    if (vB.lengthSq() < 1e-6) vB.set(1, 0, 0);
    vB.normalize();
    e3.crossVectors(vA, vB).multiplyScalar(sign);
    const L = len * (b % 4 === 0 ? 0.8 : 1);              // fingertip points sit past the end of the bone
    hm.makeBasis(e1.copy(vA).multiplyScalar(L), e2.copy(vB).multiplyScalar(L), e3.multiplyScalar(L)).setPosition(P[a]);
    rig.bones[i].matrix.copy(hm);
    rig.bones[i].matrixWorldNeedsUpdate = true;
  });
  rig.group.visible = true;
}

let scratch;
export function drawHandVeil(g, pts, alpha) {      // pts: the rig's smoothed points, so the veil stays under the bones
  const { W, H } = view;
  const px = i => pts[i].x, py = i => H - pts[i].y;
  const d = Math.hypot(px(5) - px(17), py(5) - py(17)) || 1;
  const path = new Path2D();
  [0, 1, 2, 5, 9, 13, 17].forEach((i, k) => k ? path.lineTo(px(i), py(i)) : path.moveTo(px(i), py(i)));
  path.closePath();
  const fingers = new Path2D();
  for (const c of [[1,2,3,4],[5,6,7,8],[9,10,11,12],[13,14,15,16],[17,18,19,20]])
    c.forEach((i, k) => k ? fingers.lineTo(px(i), py(i)) : fingers.moveTo(px(i), py(i)));
  // draw opaque on a scratch canvas first so overlapping strokes do not darken twice
  scratch ||= document.createElement("canvas");
  if (scratch.width !== W || scratch.height !== H) { scratch.width = W; scratch.height = H; }
  const s = scratch.getContext("2d");
  s.clearRect(0, 0, W, H); s.fillStyle = s.strokeStyle = "#04070d"; s.lineJoin = s.lineCap = "round";
  s.lineWidth = d * 0.34; s.fill(path); s.stroke(path); s.lineWidth = d * 0.36; s.stroke(fingers);
  const blur = S.feather * d * 0.22;                     // soften the hand's dark outline by the same setting
  g.filter = blur > 0.5 ? `blur(${blur.toFixed(1)}px)` : "none";
  g.globalAlpha = alpha; g.drawImage(scratch, 0, 0); g.globalAlpha = 1; g.filter = "none";
}
