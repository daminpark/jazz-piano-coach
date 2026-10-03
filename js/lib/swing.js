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
  const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
  const placement = mean(pairs.map(p => p.placement));
  const accent = mean(pairs.map(p => p.off.vel)) / Math.max(1, mean(pairs.map(p => p.on.vel)));
  return { pairs: pairs.length, placement, ratio: placement / (1 - placement), accent, legato: judged ? connected / judged : null };
}

/** short human verdicts; each has ok: true/false */
export function swingVerdicts(a) {
  const v = [];
  if (!a.pairs) return [{ ok: false, text: 'No eighth-note pairs found. Play some eighth notes in time with the groove.' }];
  const pct = Math.round(a.placement * 100);
  if (a.placement < 0.58) v.push({ ok: false, text: `Offbeats land at ${pct}% of the beat: too straight. Aim for ~67% (the third triplet partial).` });
  else if (a.placement > 0.76) v.push({ ok: false, text: `Offbeats land at ${pct}% of the beat: too dotted. Aim for ~67% (triplet feel).` });
  else v.push({ ok: true, text: `Offbeats land at ${pct}% of the beat: a good triplet-based swing.` });
  const acc = Math.round((a.accent - 1) * 100);
  if (a.accent >= 1.04) v.push({ ok: true, text: `Offbeats ${acc}% louder than downbeats: doo-VAH.` });
  else v.push({ ok: false, text: acc < 0 ? `Downbeats ${-acc}% louder than offbeats: lighten the beat, lean on the offbeat (doo-VAH).`
    : 'Offbeats and downbeats are about equal: lean a little more on the offbeat (doo-VAH).' });
  if (a.legato != null) {
    const l = Math.round(a.legato * 100);
    v.push({ ok: a.legato >= 0.8, text: a.legato >= 0.8 ? `Legato: ${l}% of notes connected.` : `Legato: only ${l}% of notes connected. Hold each note until the next one.` });
  }
  return v;
}
export const swingPasses = a => !!a.pairs && a.placement >= 0.58 && a.placement <= 0.76 && a.accent >= 1.04 && (a.legato == null || a.legato >= 0.8);
