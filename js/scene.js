// three.js scene: anatomy meshes, materials, layer visibility and canvas sizing.
import * as THREE from "three";
import { VERT, FRAG } from "./shaders.js";
import { $, S, view, clip } from "./state.js";

export const META = await (await fetch("data/meta.json")).json();
const BUFFER = await (await fetch("data/anatomy.bin")).arrayBuffer();

// Bones as pairs of hand-landmark indices (MediaPipe numbering).
export const BONES = [[1,2],[2,3],[3,4],[5,6],[6,7],[7,8],[9,10],[10,11],[11,12],[13,14],[14,15],[15,16],[17,18],[18,19],[19,20]];

export const gfx = {
  renderer: null, headScene: null, handScene: null, cam: null, ortho: null, baseProj: null,
  headGroup: null, jawPivot: null, jawM: new THREE.Matrix4(),
  meshes: {},        // name -> { mesh, layer, fixedMode }
  handRigs: [],      // two hands, each { group, palm, bones[], pts, seen }
};

function makeMat(xray, solid, mode = 0) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(xray) }, uSolidColor: { value: new THREE.Color(solid) },
      uOpacity: { value: 1 }, uGain: { value: 1 }, uMode: { value: mode }, uOrtho: { value: 0 },
      uFade: { value: 0 }, uFeather: { value: 0 }, uCutSoft: { value: 0 },
      uClipOn: { value: 0 }, uClip: { value: new THREE.Vector4(1, 0, 0, 0) }, uToHead: { value: new THREE.Matrix4() },
    },
    vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide, transparent: true,
    depthTest: false, depthWrite: false, blending: mode === 2 ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
}

// Vertices are stored as 16-bit values inside each mesh's bounding box.
function decodeMeshes() {
  const out = {};
  for (const m of META.meshes) {
    const q = new Uint16Array(BUFFER, m.offV, m.nv * 3), pos = new Float32Array(m.nv * 3);
    for (let i = 0; i < q.length; i++) pos[i] = m.min[i % 3] + q[i] / 65535 * m.size[i % 3];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint16Array(BUFFER, m.offI, m.ni).slice(), 1));
    geo.computeVertexNormals();
    out[m.name] = geo;
  }
  return out;
}

// The dataset stores both eyeballs as one mesh. Split it at the midline into two meshes, each re-centred on its own
// eyeball so it can rotate about its centre.
function splitEyes(geo) {
  const pos = geo.attributes.position.array, idx = geo.index.array, parts = [[], []];
  for (let i = 0; i < idx.length; i += 3) parts[(pos[idx[i] * 3] + pos[idx[i + 1] * 3] + pos[idx[i + 2] * 3]) > 0 ? 0 : 1].push(idx[i], idx[i + 1], idx[i + 2]);
  return parts.map(tris => {                                 // [0] = x > 0 = the subject's left eye
    const used = [...new Set(tris)], remap = new Map(used.map((v, n) => [v, n])), c = new THREE.Vector3(), p = new Float32Array(used.length * 3);
    for (const v of used) c.x += pos[v * 3] / used.length, c.y += pos[v * 3 + 1] / used.length, c.z += pos[v * 3 + 2] / used.length;
    used.forEach((v, n) => { p[n * 3] = pos[v * 3] - c.x; p[n * 3 + 1] = pos[v * 3 + 1] - c.y; p[n * 3 + 2] = pos[v * 3 + 2] - c.z; });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(p, 3));
    g.setIndex(tris.map(v => remap.get(v)));
    g.computeVertexNormals();
    return { geo: g, centre: c };
  });
}

export function buildScene() {
  const renderer = gfx.renderer = new THREE.WebGLRenderer({ canvas: $("gl"), alpha: true, antialias: true });
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  gfx.headScene = new THREE.Scene(); gfx.handScene = new THREE.Scene();
  // MediaPipe places the face for a camera with a 63 degree vertical field of view.
  gfx.cam = new THREE.PerspectiveCamera(63, view.W / view.H, 1, 10000);
  gfx.ortho = new THREE.OrthographicCamera(0, view.W, view.H, 0, -5000, 5000);
  const geos = decodeMeshes();

  const headGroup = gfx.headGroup = new THREE.Group();
  headGroup.matrixAutoUpdate = false; headGroup.visible = false;
  gfx.headScene.add(headGroup);
  const jawPivot = gfx.jawPivot = new THREE.Group();
  jawPivot.position.fromArray(META.jawPivot); headGroup.add(jawPivot);

  const add = (name, geo, layer, xray, solid, order, parent, mode) => {
    const mesh = new THREE.Mesh(geo, makeMat(xray, solid, mode));
    mesh.renderOrder = order; mesh.frustumCulled = false;
    (parent || headGroup).add(mesh);
    gfx.meshes[name] = { mesh, layer, fixedMode: mode };
    return mesh;
  };
  add("veil", geos.skin, "veil", 0x04070d, 0x04070d, -10, null, 2).material.uniforms.uFade.value = 1;
  add("outline", geos.skin, "outline", 0x6fb6ff, 0x6fb6ff, 1, null, 0).material.uniforms.uFade.value = 1;
  add("muscles", geos.muscles, "muscles", 0xff6b5e, 0xb5453c, 2);
  add("cranium", geos.cranium, "skull", 0xbfe3ff, 0xe9e2cf, 3);
  const jaw = add("jaw", geos.jaw, "skull", 0xbfe3ff, 0xe9e2cf, 3, jawPivot);
  jaw.position.fromArray(META.jawPivot).multiplyScalar(-1);
  splitEyes(geos.eyes).forEach(({ geo, centre }, i) => add(i ? "eyeR" : "eyeL", geo, "eyes", 0xfff3a8, 0xf4f4ee, 4).position.copy(centre));
  add("cerebrum", geos.cerebrum, "brain", 0xff9fc0, 0xe2a39d, 5);
  add("hindbrain", geos.hindbrain, "brain", 0xffc37a, 0xd6ad84, 5);

  for (let h = 0; h < 2; h++) {
    const group = new THREE.Group(); group.visible = false; gfx.handScene.add(group);
    const mk = geo => {
      const m = new THREE.Mesh(geo, makeMat(0xd9f0ff, 0xe9e2cf)); m.material.uniforms.uOrtho.value = 1;
      m.matrixAutoUpdate = false; m.frustumCulled = false; group.add(m); return m;
    };
    gfx.handRigs.push({ group, palm: mk(geos.hand_palm), bones: BONES.map(([a, b]) => mk(geos[`hand_b_${a}_${b}`])), pts: null });
  }
  applyStyle(); resize();
}

function eachMat(fn) {
  for (const k in gfx.meshes) fn(gfx.meshes[k].mesh.material, gfx.meshes[k]);
  for (const r of gfx.handRigs) { fn(r.palm.material, { layer: "hands" }); for (const b of r.bones) fn(b.material, { layer: "hands" }); }
}

export function applyStyle() {
  if (!gfx.renderer) return;
  const solid = S.style === "solid";
  eachMat((m, info) => {
    if (info.fixedMode !== undefined) return;            // veil and outline keep their own look
    m.uniforms.uMode.value = solid ? 1 : 0;
    m.blending = solid ? THREE.NormalBlending : THREE.AdditiveBlending;
    m.depthTest = solid; m.depthWrite = solid; m.needsUpdate = true;
  });
}

export function resize() {
  const r = $("stage").getBoundingClientRect();
  view.W = Math.max(2, Math.round(r.width)); view.H = Math.max(2, Math.round(r.height));
  const { renderer, cam, ortho } = gfx;
  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(view.W, view.H, false);
    cam.aspect = view.W / view.H; cam.updateProjectionMatrix(); gfx.baseProj = cam.projectionMatrix.clone();
    ortho.right = view.W; ortho.top = view.H; ortho.updateProjectionMatrix();
  }
  for (const id of ["shade", "hud"]) { const c = $(id); c.width = view.W; c.height = view.H; }
}
new ResizeObserver(resize).observe($("stage"));

// ------------------------------ layers & reveal ------------------------------
const XRAY_GAIN = { outline: 0.55, muscles: 0.5, cerebrum: 0.36, hindbrain: 0.6, eyeL: 0.9, eyeR: 0.9 };

export function applyLayers() {
  let on = 0, cx = 1, cy = 0, cw = 0;
  switch (S.reveal) {                                                       // your left = +x
    case "left":   on = 1; cx = 1;  cw = (S.cut - 0.5) * 16; break;
    case "right":  on = 1; cx = -1; cw = (S.cut - 0.5) * 16; break;
    case "top":    on = 1; cx = 0; cy = 1;  cw = -9 + (1 - S.cut) * 22; break;
    case "bottom": on = 1; cx = 0; cy = -1; cw = -(-9 + S.cut * 22); break;
  }
  Object.assign(clip, { on, x: cx, y: cy, w: cw });
  const { jawPivot, jawM, meshes } = gfx;
  jawPivot.updateMatrix(); meshes.jaw.mesh.updateMatrix();
  jawM.copy(jawPivot.matrix).multiply(meshes.jaw.mesh.matrix);
  const heavy = (S.skull ? 1 : 0) + (S.brain ? 1 : 0) + (S.muscles ? 1 : 0);
  const share = 1 / (0.4 + 0.6 * Math.max(1, heavy));        // several glowing layers at once would wash out to white
  for (const k in meshes) {
    const { mesh, layer } = meshes[k], u = mesh.material.uniforms;
    mesh.visible = layer === "veil" ? true : !!S[layer];
    // x-ray light adds up, so layers with many overlapping surfaces get a lower share
    u.uGain.value = (S.style === "solid" && k !== "outline") ? Math.min(1.25, 0.6 + 0.4 * S.bright)
                  : S.bright * (XRAY_GAIN[k] || 1) * (layer === "outline" ? 1 : share);
    u.uOpacity.value = layer === "veil" ? 1 - S.real : 1;
    u.uClipOn.value = on; u.uClip.value.set(cx, cy, 0, cw);
    u.uFeather.value = S.feather * 0.75; u.uCutSoft.value = S.feather * 5;   // outline softness, and up to 5 cm of fade at a cut
    if (k === "jaw") u.uToHead.value.copy(jawPivot.matrix).multiply(mesh.matrix);
    else if (k[0] === "e" && k.length === 4) { mesh.updateMatrix(); u.uToHead.value.copy(mesh.matrix); }   // eyeL / eyeR: shader needs head coordinates
    else u.uToHead.value.identity();
  }
}
