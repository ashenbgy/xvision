// Sidebar controls <-> settings.
import { $, S, save, LAYERS, SLIDERS, DEFAULTS } from "./state.js";
import { applyStyle } from "./scene.js";

const FIT_SCALE = ["fs", "fw", "fh", "fd"], FIT_SHIFT = ["fx", "fy", "fz"];

function sync() {
  for (const k of LAYERS) $(`L_${k}`).checked = S[k];
  for (const b of $("style").children) b.classList.toggle("on", b.dataset.style === S.style);
  for (const k of SLIDERS) $(k).value = S[k];
  for (const k of FIT_SCALE) $(`${k}v`).textContent = `${Math.round(S[k] * 100)}%`;
  for (const k of FIT_SHIFT) $(`${k}v`).textContent = `${S[k] > 0 ? "+" : ""}${S[k].toFixed(1)} cm`;
  $("featherv").textContent = `${Math.round(S.feather * 100)}%`;
  $("jawv").textContent = `${Math.round(S.jaw * 100)}%`;
  $("smoothv").textContent = `${Math.round(S.smooth * 100)}%`;
  $("labels").checked = S.labels;
  $("reveal").value = S.reveal; $("showdata").checked = S.showdata; $("data").hidden = !S.showdata;
  $("cutrow").hidden = S.reveal === "whole";
  $("cutlabel").textContent = S.reveal === "lens" ? "Lens size" : "Cut position";
}
const change = patch => { Object.assign(S, patch); save(); sync(); };

export function initUI() {
  for (const k of LAYERS) $(`L_${k}`).onchange = e => change({ [k]: e.target.checked });
  for (const k of SLIDERS) $(k).oninput = e => change({ [k]: parseFloat(e.target.value) });
  for (const b of $("style").children) b.onclick = () => { change({ style: b.dataset.style }); applyStyle(); };
  $("labels").onchange = e => change({ labels: e.target.checked });
  $("showdata").onchange = e => change({ showdata: e.target.checked });
  $("reveal").onchange = e => change({ reveal: e.target.value, cut: 0.5 });
  $("fitreset").onclick = () => change(Object.fromEntries([...FIT_SCALE, ...FIT_SHIFT].map(k => [k, DEFAULTS[k]])));
  for (const b of document.querySelectorAll("[data-preset]")) b.onclick = () => {
    const p = b.dataset.preset;
    change({ skull: p === "skull" || p === "all", brain: p === "brain" || p === "all",
             muscles: p === "muscles" || p === "all", eyes: p !== "brain", outline: true });
  };
  sync();
}
