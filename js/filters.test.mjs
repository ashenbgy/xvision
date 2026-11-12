// Run: node js/filters.test.mjs
import assert from "node:assert/strict";
import { OneEuro, cutoffFor } from "./filters.js";

const std = a => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 2;

// 1. holding still: jitter is cut by more than half
const f = new OneEuro(0.1), raw = [], out = [];
for (let i = 0; i < 300; i++) { const v = 10 + rnd(); raw.push(v); out.push(f.step(v, i / 60, cutoffFor(0.5))); }
assert.ok(std(out.slice(60)) < 0.5 * std(raw.slice(60)), "still jitter not reduced");

// 2. a fast move is followed quickly (within 12 frames = 0.2 s)
const g = new OneEuro(0.1); let y = 0;
for (let i = 0; i < 60; i++) g.step(0, i / 60, cutoffFor(0.5));
for (let i = 60; i < 72; i++) y = g.step(30, i / 60, cutoffFor(0.5));
assert.ok(y > 27, `lag too high: ${y}`);
console.log("filters ok");
