// Head tracking: smooth the tracker's pose and pin the model onto the face as seen on screen.
import * as THREE from "three";
import { S } from "./state.js";
import { OneEuro, cutoffFor } from "./filters.js";
import { META, gfx } from "./scene.js";

export const head = {
  found: false, jaw: 0, fitS: 1, fitX: 0, fitY: 0,
  pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scl: new THREE.Vector3(1, 1, 1),
};
export const FIT_IDS = Object.keys(META.fit).map(Number);
// Chin and mouth corners move when the mouth opens, so they must not take part in pinning the (rigid) skull to the face.
const JAW_IDS = [152, 61, 291];
const FIT_STABLE = FIT_IDS.filter(id => !JAW_IDS.includes(id));

// Per-signal adaptive filters (beta is in signal units per second: cm, quaternion component, jaw 0..1).
const F = { pos: [0, 1, 2].map(() => new OneEuro(0.1)), quat: [0, 1, 2, 3].map(() => new OneEuro(5)), jaw: new OneEuro(3), gaze: [0, 1, 2, 3].map(() => new OneEuro(3)) };   // gaze: yaw/pitch of each eye
const allFilters = () => [...F.pos, ...F.quat, F.jaw, ...F.gaze];

const m = new THREE.Matrix4(), fitM = new THREE.Matrix4(), corr = new THREE.Matrix4();
const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();

const JAW_FULL = 0.65, JAW_MAX = 0.5;            // jawOpen score that counts as fully open (the tracker rarely reads higher), and the jaw angle (rad) it maps to
const GAZE_YAW = 0.7, GAZE_PITCH = 0.5;          // eye rotation (rad) at a full blendshape score

/** bs: the tracker's blendshape scores by name. */
export function updateHead(matrixData, lms, bs, now) {
  const { cam, baseProj, headGroup, jawPivot } = gfx;
  m.fromArray(matrixData);
  const e = m.elements;                                  // accept either memory layout
  if (Math.abs(e[12]) + Math.abs(e[13]) + Math.abs(e[14]) < 1e-6 && Math.abs(e[3]) + Math.abs(e[7]) + Math.abs(e[11]) > 1e-3) m.transpose();
  m.decompose(p, q, s);
  const t = now / 1000, mc = cutoffFor(S.smooth);
  if (!head.found) { allFilters().forEach(f => f.reset()); head.scl.copy(s); head.fitS = 1; head.fitX = head.fitY = 0; }
  else head.scl.lerp(s, 0.5);
  head.pos.set(F.pos[0].step(p.x, t, mc), F.pos[1].step(p.y, t, mc), F.pos[2].step(p.z, t, mc));
  if (head.found && q.dot(head.quat) < 0) q.set(-q.x, -q.y, -q.z, -q.w);   // same hemisphere, so the components filter cleanly
  head.quat.set(F.quat[0].step(q.x, t, mc), F.quat[1].step(q.y, t, mc), F.quat[2].step(q.z, t, mc), F.quat[3].step(q.w, t, mc)).normalize();
  head.found = true;
  head.jaw = F.jaw.step(bs.jawOpen ?? 0, t, mc * 2);                // the jaw moves fast, so it gets a looser filter
  m.compose(head.pos, head.quat, head.scl);              // smoothed pose

  // Compare where key face points land with where the tracker saw them, then fit scale + shift (least squares).
  const P = [], Q = [];
  for (const id of FIT_STABLE) {
    v.fromArray(META.fit[id]).applyMatrix4(m).applyMatrix4(baseProj);
    const l = lms[id]; if (!l) continue;
    P.push([v.x, v.y]); Q.push([l.x * 2 - 1, 1 - l.y * 2]);
  }
  let pmx = 0, pmy = 0, qmx = 0, qmy = 0;
  for (let i = 0; i < P.length; i++) { pmx += P[i][0]; pmy += P[i][1]; qmx += Q[i][0]; qmy += Q[i][1]; }
  pmx /= P.length; pmy /= P.length; qmx /= P.length; qmy /= P.length;
  let num = 0, den = 0;
  for (let i = 0; i < P.length; i++) {
    const ax = P[i][0] - pmx, ay = P[i][1] - pmy;
    num += ax * (Q[i][0] - qmx) + ay * (Q[i][1] - qmy); den += ax * ax + ay * ay;
  }
  const k = Math.max(0.6, Math.min(1.6, den > 1e-9 ? num / den : 1));
  head.fitS += (k - head.fitS) * 0.5;
  head.fitX += (qmx - head.fitS * pmx - head.fitX) * 0.7;
  head.fitY += (qmy - head.fitS * pmy - head.fitY) * 0.7;
  corr.set(head.fitS, 0, 0, head.fitX,  0, head.fitS, 0, head.fitY,  0, 0, 1, 0,  0, 0, 0, 1);
  cam.projectionMatrix.copy(baseProj).premultiply(corr);
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();

  // The user's manual fit: overall size, per-axis stretch and position (local +x is your left, so the mirror view flips it).
  fitM.makeScale(S.fs * S.fw, S.fs * S.fh, S.fs * S.fd).setPosition(-S.fx, S.fy, S.fz);
  headGroup.matrix.copy(m).multiply(fitM);
  headGroup.matrixWorldNeedsUpdate = true;               // matrix is set by hand, so tell three.js
  headGroup.visible = true;
  jawPivot.rotation.x = Math.min(1, Math.max(0, head.jaw / JAW_FULL)) * JAW_MAX * S.jaw;

  // Gaze. Blendshape names are from the subject's point of view; model +x is the subject's left, so "out" is +yaw on the left eye
  // and -yaw on the right. Looking up is a negative rotation about x.
  const g = F.gaze, b = n => bs[n] ?? 0, gc = mc * 2;
  const yawL = g[0].step(b("eyeLookOutLeft") - b("eyeLookInLeft"), t, gc), pitchL = g[1].step(b("eyeLookDownLeft") - b("eyeLookUpLeft"), t, gc);
  const yawR = g[2].step(b("eyeLookInRight") - b("eyeLookOutRight"), t, gc), pitchR = g[3].step(b("eyeLookDownRight") - b("eyeLookUpRight"), t, gc);
  gfx.meshes.eyeL.mesh.rotation.set(pitchL * GAZE_PITCH, yawL * GAZE_YAW, 0, "YXZ");
  gfx.meshes.eyeR.mesh.rotation.set(pitchR * GAZE_PITCH, yawR * GAZE_YAW, 0, "YXZ");
}
