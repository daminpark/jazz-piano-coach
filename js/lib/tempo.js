// A timed take: count-in, accompaniment, a running beat clock, and MIDI timestamps converted to beats.
// Times are compared as heard (audio output time), so speaker latency doesn't count against you.
import { audio, Scheduler, countIn } from '../audio.js';

export class Take {
  /** beats: length of the take (after the count-in); events: accompaniment {t in seconds from beat 0} */
  constructor({ bpm, beats, events = [], countInBeats = 4, onBeat, onEnd }) {
    Object.assign(this, { bpm, beats, events, countInBeats, onBeat, onEnd });
    this.beatSec = 60 / bpm; this.running = false; this.lastBeat = -Infinity;
  }
  async start() {
    await audio.init();
    this.t0 = audio.now() + 0.1 + this.countInBeats * this.beatSec;
    this.sched = new Scheduler([...countIn(this.bpm, this.countInBeats), ...this.events], this.t0).start();
    this.running = true;
    this.timer = setInterval(() => this.tick(), 30);
    return this;
  }
  tick() {
    const b = this.beatNow();
    if (this.onBeat) this.onBeat(b);
    if (b >= this.beats + 0.6) this.stop(true);
  }
  beatNow() { return (audio.heardTime() - this.t0) / this.beatSec; }
  /** a MIDI timestamp (performance.now ms) in beats from beat 0 */
  beatAt(ms) { return (audio.perfToAudio(ms) - this.t0) / this.beatSec; }
  /** the same in seconds from beat 0 */
  secAt(ms) { return audio.perfToAudio(ms) - this.t0; }
  stop(finished = false) {
    if (!this.running) return;
    this.running = false; clearInterval(this.timer); this.sched.stop();
    if (this.onEnd) this.onEnd(finished);
  }
}

/**
 * Match played notes to expected notes: each played note takes the nearest unmatched expected note of the same
 * pitch within `tol` beats. expected: [{beat, midi, ...}], played: [{beat, midi, vel, offBeat?}]
 */
export function matchNotes(expected, played, tol = 0.25) {
  const used = new Set(), pairs = [], extra = [];
  for (const p of played) {
    let best = -1, bd = Infinity;
    expected.forEach((e, k) => {
      if (used.has(k) || e.midi !== p.midi) return;
      const d = Math.abs(p.beat - e.beat);
      if (d <= tol && d < bd) { bd = d; best = k; }
    });
    if (best < 0) extra.push(p); else { used.add(best); pairs.push({ e: expected[best], p, k: best, d: p.beat - expected[best].beat }); }
  }
  return { pairs, extra, missed: expected.filter((_, k) => !used.has(k)), hit: used };
}

export const mean = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
