// Shared state: DOM helper, user settings, and the canvas size.
export const $ = id => document.getElementById(id);

export function setStatus(text, cls = "") {
  const el = $("status");
  el.textContent = text;
  el.className = `pill ${cls}`.trim();
}

export const DEFAULTS = {
  skull: true, brain: false, muscles: false, eyes: true, outline: true, hands: true,
  style: "xray", bright: 1, real: 0.12, feather: 0.2, reveal: "whole", cut: 0.5, showdata: false,
  fs: 1, fw: 1, fh: 1, fd: 1, fx: 0, fy: 0, fz: 0, labels: false, smooth: 0.5, jaw: 1,
};
export const LAYERS = ["skull", "brain", "muscles", "eyes", "outline", "hands"];
export const SLIDERS = ["bright", "real", "feather", "cut", "fs", "fw", "fh", "fd", "fx", "fy", "fz", "smooth", "jaw"];

const KEY = "xr_settings";
export const S = { ...DEFAULTS };
try { Object.assign(S, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { /* private mode: run with defaults */ }
export function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* ignore */ } }

export const view = { W: 640, H: 480 };                  // stage size in CSS pixels
export const clip = { on: 0, x: 1, y: 0, w: 0 };         // active reveal cut, shared by shaders and labels
export const TAU = Math.PI * 2;
