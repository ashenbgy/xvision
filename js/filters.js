// One Euro filter (Casiez et al. 2012): heavy smoothing while a signal is still, light smoothing while it moves fast.
// Fixes the jitter-vs-lag trade-off of a constant lerp.
const alpha = (cutoff, dt) => { const r = 2 * Math.PI * cutoff * dt; return r / (r + 1); };

export class OneEuro {
  /** beta: how quickly the cutoff opens up with speed, in the units of the signal (per second). */
  constructor(beta, dCutoff = 1) { this.beta = beta; this.dCutoff = dCutoff; this.x = null; }
  reset() { this.x = null; }
  /** v: new sample, t: time in seconds, minCutoff: Hz when still (lower = smoother). */
  step(v, t, minCutoff) {
    if (this.x === null) { this.x = v; this.dx = 0; this.t = t; return v; }
    const dt = Math.max(t - this.t, 1e-3); this.t = t;
    this.dx += alpha(this.dCutoff, dt) * ((v - this.x) / dt - this.dx);
    this.x += alpha(minCutoff + this.beta * Math.abs(this.dx), dt) * (v - this.x);
    return this.x;
  }
}

/** Smoothness slider (0..1) -> still-cutoff in Hz: 0 = 3 Hz (responsive) ... 1 = 0.15 Hz (very smooth). */
export const cutoffFor = smooth => 3 * 0.05 ** smooth;
