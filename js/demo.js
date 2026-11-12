// Built-in test scene (open the page with #demo): a pretend head and the dataset's own hand, no camera.
// Add ?still to render a single frame.
import * as THREE from "three";
import { view } from "./state.js";
import { META, gfx } from "./scene.js";
import { FIT_IDS, updateHead } from "./head.js";
import { renderFrame } from "./render.js";

export function demoLoop() {
  const still = new URLSearchParams(location.search).has("still");
  const base = META.demoHand, [cx, cy, cz] = base[9];
  (function tick() {
    if (!still) requestAnimationFrame(tick);
    const { W, H } = view, now = performance.now(), t = still ? 1.2 : now / 1000;
    const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-0.06 + 0.05 * Math.sin(t * 0.7), 0.42 * Math.sin(t * 0.5 + 0.9), 0.04, "YXZ"));
    m.setPosition(-5 + 2 * Math.sin(t * 0.4), 1.5, -46);
    const lms = [];
    for (const id of FIT_IDS) {
      const v = new THREE.Vector3().fromArray(META.fit[id]).applyMatrix4(m).applyMatrix4(gfx.baseProj);
      lms[id] = { x: (v.x + 1) / 2, y: (1 - v.y) / 2, z: 0 };
    }
    updateHead(m.elements, lms, { jawOpen: 0.65 * (0.5 + 0.5 * Math.sin(t * 1.3)), eyeLookOutLeft: Math.max(0, Math.sin(t)), eyeLookInRight: Math.max(0, Math.sin(t)), eyeLookInLeft: Math.max(0, -Math.sin(t)), eyeLookOutRight: Math.max(0, -Math.sin(t)) }, now);
    // the dataset's right hand, fingers pointing up, palm to the camera, placed at the side of the picture
    const k = 0.0021 * H / W * (4 / 3);
    const hand = base.map(p => ({ x: 0.2 - (p[0] - cx) * k, y: 0.56 + (p[2] - cz) * k * W / H, z: (p[1] - cy) * k }));
    renderFrame(now, FIT_IDS.map(id => lms[id]), [hand], [true]);
  })();
}
