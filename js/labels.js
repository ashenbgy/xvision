// Anatomy labels: each points at its structure and sits in a column beside the subject, spread so none overlap.
import * as THREE from "three";
import { S, view, clip, TAU } from "./state.js";
import { META, gfx } from "./scene.js";
import { head } from "./head.js";

const LABEL_COLOR = { skull: "#d9f0ff", brain: "#ffc2d6", muscles: "#ffb3aa", eyes: "#fff3a8", hands: "#d9f0ff" };
const HEAD_C = [0, 3.2, -4.8];                    // rough centre of the head, in head coordinates (cm)
const HAND_LABELS = [["Distal phalanx", 11, 12, 0.5], ["Middle phalanx", 10, 11, 0.5], ["Proximal phalanx", 9, 10, 0.5],
                     ["Metacarpal", 0, 9, 0.62], ["Carpal bones (wrist)", 0, 9, 0.1]];
const labelState = {};                            // key+text -> { side, wy, rank } so labels glide instead of jumping
const lp = new THREE.Vector3(), ln = new THREE.Vector3(), lc = new THREE.Vector3();
let frameNo = 0, headSplit = 0;

function toScreen(p) {                            // head/view-space point -> heads-up layer pixels (mirrored like the picture)
  lc.copy(p).applyMatrix4(gfx.cam.projectionMatrix);
  return { x: view.W - (lc.x + 1) / 2 * view.W, y: (1 - lc.y) / 2 * view.H };
}

function collectHeadLabels(lens) {
  const out = [], solid = S.style === "solid", M = gfx.headGroup.matrix;
  for (const L of META.labels) {
    if (!S[L.layer]) continue;
    if (solid && S.muscles && (L.layer === "skull" || L.layer === "brain")) continue;   // hidden under the muscles
    if (solid && S.skull && L.layer === "brain") continue;                               // hidden inside the skull
    let best = null;
    for (const pt of L.pts) {
      lp.fromArray(pt); if (L.jaw) lp.applyMatrix4(gfx.jawM);
      if (clip.on && clip.x * lp.x + clip.y * lp.y < clip.w) continue;                    // cut away
      ln.set(lp.x - HEAD_C[0], lp.y - HEAD_C[1], lp.z - HEAD_C[2]).transformDirection(M);
      lp.applyMatrix4(M);
      const facing = -(ln.x * lp.x + ln.y * lp.y + ln.z * lp.z) / (lp.length() || 1);
      if (solid && facing < 0.12) continue;                                              // on the far side
      const s = toScreen(lp);
      if (lens && Math.hypot(s.x - lens.x, s.y - lens.y) > lens.r) continue;
      if (!best || facing > best.facing) best = { text: L.t, color: LABEL_COLOR[L.layer], ax: s.x, ay: s.y, facing };
    }
    if (best) out.push(best);
  }
  return out;
}

function layoutLabels(g, items, cx, halfWidth, key, splitX = cx) {
  const { W, H } = view;
  // two columns beside the subject; each label joins the column on its own side
  const cols = { left: [], right: [] };
  for (const it of items) {
    const st = labelState[key + it.text] ||= { side: it.ax < splitX ? "left" : "right", wy: undefined, seen: 0 };
    if (st.side === "left" && it.ax > splitX + halfWidth * 0.15) st.side = "right";
    else if (st.side === "right" && it.ax < splitX - halfWidth * 0.15) st.side = "left";
    it.st = st; cols[st.side].push(it);
  }
  g.font = "600 12.5px system-ui,-apple-system,Segoe UI,Roboto,sans-serif"; g.textBaseline = "middle"; g.lineJoin = "round";
  for (const side of ["left", "right"]) {
    const list = cols[side], gap = 18;
    // Smooth each label's wanted height, and keep last frame's order unless two labels are clearly the other way round,
    // so labels neither overlap nor flicker between slots.
    for (const it of list) {
      const st = it.st;
      if (st.wy === undefined || frameNo - st.seen > 3) { st.wy = it.ay; st.rank = undefined; } else st.wy += (it.ay - st.wy) * 0.5;
      st.seen = frameNo;
    }
    list.sort((p, q) => (p.st.rank === undefined || q.st.rank === undefined || p.st.side !== p.st.rankSide || q.st.side !== q.st.rankSide)
                        ? p.st.wy - q.st.wy : p.st.rank - q.st.rank);
    for (let swapped = true, guard = 0; swapped && guard < 40; guard++) {
      swapped = false;
      for (let i = 0; i + 1 < list.length; i++)
        if (list[i].st.wy > list[i + 1].st.wy + 7) { [list[i], list[i + 1]] = [list[i + 1], list[i]]; swapped = true; }
    }
    list.forEach((it, i) => { it.st.rank = i; it.st.rankSide = side; });
    let prev = -1e9;
    for (const it of list) { it.ty = Math.max(it.st.wy, prev + gap); prev = it.ty; }
    const over = prev - (H - 12); if (over > 0) for (const it of list) it.ty -= over;      // keep the stack on screen
    const tx = side === "left" ? Math.max(8, cx - halfWidth - 22) : Math.min(W - 8, cx + halfWidth + 22);
    for (const it of list) {
      const y = it.ty;
      g.strokeStyle = it.color; g.globalAlpha = 0.75; g.lineWidth = 1;
      g.beginPath(); g.moveTo(it.ax, it.ay); g.lineTo(tx + (side === "left" ? 5 : -5), y); g.stroke();
      g.globalAlpha = 1; g.fillStyle = it.color; g.beginPath(); g.arc(it.ax, it.ay, 2.6, 0, TAU); g.fill();
      g.textAlign = side === "left" ? "right" : "left";
      g.strokeStyle = "rgba(4,7,13,.9)"; g.lineWidth = 3.5; g.strokeText(it.text, tx, y);
      g.fillText(it.text, tx, y);
    }
  }
}

export function drawLabels(g, lens) {
  const { W, H } = view;
  frameNo++;
  let hx = W / 2;
  if (head.found && gfx.headGroup.visible) {
    lp.fromArray(HEAD_C).applyMatrix4(gfx.headGroup.matrix);
    const c = toScreen(lp); lp.x += 10.5 * S.fs * S.fw; const e = toScreen(lp);
    hx = c.x;
    const items = collectHeadLabels(lens);
    // when the head is turned most points sit on one side, so split nearer the middle of the points to balance the columns
    const xs = items.map(it => it.ax).sort((a, b) => a - b), med = xs.length ? xs[xs.length >> 1] : hx;
    headSplit += ((hx + med) / 2 - headSplit) * 0.2;
    layoutLabels(g, items, hx, Math.abs(e.x - c.x), "h:", headSplit);
  }
  if (S.hands) gfx.handRigs.forEach((rig, i) => {
    if (!rig.group.visible || !rig.pts) return;
    const P = rig.pts, at = (a, b, k) => ({ ax: W - (P[a].x + (P[b].x - P[a].x) * k), ay: H - (P[a].y + (P[b].y - P[a].y) * k) });
    const items = HAND_LABELS
      .map(([text, a, b, k]) => ({ text, color: LABEL_COLOR.hands, ...at(a, b, k) }))
      .filter(it => !lens || Math.hypot(it.ax - lens.x, it.ay - lens.y) <= lens.r);
    let lo = 1e9, hi = -1e9; for (const p of P) { lo = Math.min(lo, W - p.x); hi = Math.max(hi, W - p.x); }
    // put all of a hand's labels on its outer side, away from the head
    const mid = (lo + hi) / 2, outerRight = mid > hx, far = outerRight ? lo - 1e4 : hi + 1e4;
    layoutLabels(g, items, far, outerRight ? hi - far : far - lo, `hand${i}:`);
  });
}
