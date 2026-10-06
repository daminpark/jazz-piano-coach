// Swing analysis from MIDI: where offbeat eighths land, whether they're accented, and how legato the line is.
// notes: [{t, off, vel, midi}] in seconds on the same clock as t0; beatSec = one beat.

/** fraction of the beat (0..1) at which each note falls, with the beat index */
export function phaseOf(t, t0, beatSec) {
  const x = (t - t0) / beatSec;
  const beat = Math.floor(x + 0.12); // a slightly early downbeat still counts as that beat
  return { beat, phase: x - beat };
}

export function analyzeSwing(notes, t0, beatSec) {
  const ns = notes.slice().sort((a, b) => a.t - b.t);
  const pairs = [];
  for (let i = 0; i < ns.length - 1; i++) {
    const a = phaseOf(ns[i].t, t0, beatSec), b = phaseOf(ns[i + 1].t, t0, beatSec);
    // an eighth-note pair: a note near the beat, then the next note in the second half of the same beat
    if (Math.abs(a.phase) <= 0.14 && b.beat === a.beat && b.phase >= 0.38 && b.phase <= 0.88) {
      pairs.push({ on: ns[i], off: ns[i + 1], placement: b.phase });
    }
  }
  // legato: consecutive notes with (almost) no gap between release and the next attack
  let connected = 0, judged = 0;
  for (let i = 0; i < ns.length - 1; i++) {
    const gapToNext = ns[i + 1].t - ns[i].t;
    if (gapToNext > 0.9 * beatSec || ns[i].off == null) continue; // only within flowing eighth lines
    judged++;
    if (ns[i + 1].t - ns[i].off < 0.035) connected++;
  }
  if (!pairs.length) return { pairs: 0, legato: judged ? connected / judged : null };
  return { ...pairStats(pairs.map(p => ({ placement: p.placement, onVel: p.on.vel, offVel: p.off.vel }))), legato: judged ? connected / judged : null };
}

export const SWING_ZONE = [0.58, 0.76];
const LOUDER_BY = 3; // MIDI velocity: an offbeat counts as louder only if it's clearly louder than its beat
export const PAIR_TARGET = 0.75; // three pairs in four, so a few very loud offbeats can't make up for the rest

/** per-pair counts: how many offbeats landed in the swing zone, how many were louder than the beat before them */
export function pairStats(pairs) {
  const n = pairs.length;
  if (!n) return { pairs: 0 };
  const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
  const inZone = pairs.filter(p => p.placement >= SWING_ZONE[0] && p.placement <= SWING_ZONE[1]).length;
  const louder = pairs.filter(p => p.offVel >= p.onVel + LOUDER_BY).length;
  const placement = mean(pairs.map(p => p.placement));
  return { pairs: n, placement, inZone, louder, zoneOk: inZone / n >= PAIR_TARGET, louderOk: louder / n >= PAIR_TARGET };
}

/** short human verdicts; each has ok: true/false */
export function swingVerdicts(a, { offbeat = 'offbeat' } = {}) {
  const v = [];
  if (!a.pairs) return [{ ok: false, text: 'No eighth-note pairs found. Play some eighth notes in time with the groove.' }];
  const pct = Math.round(a.placement * 100);
  const where = a.placement < SWING_ZONE[0] ? 'mostly too straight' : a.placement > SWING_ZONE[1] ? 'mostly too late' : 'about right';
  v.push({ ok: a.zoneOk, text: `Swing: ${a.inZone} of ${a.pairs} ${offbeat}s landed in the swing zone (on average at ${pct}% of the beat, ${where}; aim for 67%).` });
  v.push({ ok: a.louderOk, text: a.louderOk ? `Accent: the ${offbeat} was louder than its beat in ${a.louder} of ${a.pairs} pairs. doo-VAH.`
    : `Accent: the ${offbeat} was louder than its beat in only ${a.louder} of ${a.pairs} pairs. Keep every beat light and every ${offbeat} leaning, not just some.` });
  if (a.legato != null) {
    const l = Math.round(a.legato * 100);
    v.push({ ok: a.legato >= 0.8, soft: true, text: a.legato >= 0.8 ? `Legato: ${l}% of notes connected.` : `Legato: only ${l}% of notes connected. Hold each note until the next one.` });
  }
  return v;
}
export const swingPasses = a => !!a.pairs && a.zoneOk && a.louderOk && (a.legato == null || a.legato >= 0.8);
