// Technique: generated exercises through the keys, checked note by note against a count-in
// (and for swung ones, where the offbeats land and whether they're accented).
//   arp   seventh-chord arpeggios 1-3-5-7-8-7-5-3, one bar per chord, left hand holding the root
//   p1235 the 1-2-3-5 pattern, two chords per bar
//   inv   each chord through its inversions and back, quarter-note block chords
import { chord as mkChord, KEYS_FOURTHS, QUALITIES, noteLabel } from '../theory.js';
import { swingGroove } from '../audio.js';
import { patternDrill } from './pattern.js';

export const TECH = {
  arp: { title: 'Seventh-chord arpeggios', perSet: 4,
    short: 'Right hand: up and down each chord (root, 3rd, 5th, 7th, octave and back) in swung eighths. Left hand: hold the root.',
    how: 'Right hand: up and down each chord, root–3rd–5th–7th–octave–7th–5th–3rd, in swung eighths, one bar per chord. Left hand: hold the root an octave lower for the whole bar. Keep the line even and legato, with a little weight on each offbeat. Fingering: 1-2-3-4-5 when the octave fits under your hand; otherwise 1-2-3-5 and slide the 5th finger to the octave. Pick one fingering per chord and keep it.' },
  p1235: { title: '1-2-3-5 patterns', perSet: 8,
    short: 'Right hand: notes 1, 2, 3 and 5 of each chord’s scale in swung eighths, two chords per bar. Left hand: the root.',
    how: 'For each chord play the 1st, 2nd, 3rd and 5th notes of its scale (C D E G for C major and C7, C D E♭ G for Cm7) as swung eighths. Two chords per bar, left hand on each root. This four-note shape is one of the most common building blocks in jazz lines. Fingering 1-2-3-5.' },
  inv: { title: 'Inversions', perSet: 2,
    short: 'Right hand: each chord as a block in root position, then 1st, 2nd and 3rd inversion going up, then back down. One chord per beat.',
    how: 'Each inversion is named by its bottom note: root position has the root at the bottom, 1st inversion the 3rd, 2nd inversion the 5th, 3rd inversion the 7th. To climb, take the bottom note and move it to the top; to come back down, take the top note and move it to the bottom. The labels above the lane say which note should be at the bottom. Right hand only; listen for all four notes sounding together.' },
};

const rootIn = (pc, lo) => lo + ((pc - lo % 12 + 12) % 12); // the first midi note >= lo with this pitch class

// minor chords on black keys are usually named with sharps (C♯m7, not D♭m7)
const rootFor = (r, q) => (q === 'm7' ? ({ Db: 'C#', Ab: 'G#', Gb: 'F#' }[r] || r) : r);
function chordsFor(ex, qualities, set) {
  const n = TECH[ex].perSet;
  if (qualities.length > 1) { // one root, its chord types in turn: hear how the colour changes
    const r = KEYS_FOURTHS[set % 12];
    return Array.from({ length: n }, (_, k) => qualities[k % qualities.length]).map(q => mkChord(rootFor(r, q), q));
  }
  return Array.from({ length: n }, (_, k) => KEYS_FOURTHS[(set * n + k) % 12]).map(r => mkChord(rootFor(r, qualities[0]), qualities[0]));
}
export const setCount = (ex, qualities) => (qualities.length > 1 ? 12 : Math.ceil(12 / TECH[ex].perSet));
export function setLabel(ex, qualities, set) {
  const ch = chordsFor(ex, qualities, set);
  return qualities.length > 1 ? noteLabel(ch[0].root) : [...new Set(ch.map(c => c.rootLabel))].join(' ');
}

/** -> { notes: [{beat, midi, hand, off}], beats, labels: [{beat, text}], swing } */
export function techExercise(ex, qualities, set) {
  const chords = chordsFor(ex, qualities, set);
  const notes = [], labels = [];
  const add = (beat, midi, hand, off = false) => notes.push({ beat, midi, hand, off });
  if (ex === 'arp') {
    chords.forEach((c, i) => {
      const r = rootIn(c.pcs[0], 60), s = QUALITIES[c.quality].semis;
      const line = [0, s[1], s[2], s[3], 12, s[3], s[2], s[1]];
      line.forEach((d, k) => add(4 * i + Math.floor(k / 2) + (k % 2 ? 2 / 3 : 0), r + d, 'R', k % 2 === 1));
      add(4 * i, r - 12, 'L');
      labels.push({ beat: 4 * i, text: c.symbol });
    });
    return { notes, beats: 4 * chords.length, labels, swing: true, split: rootIn(chords[0].pcs[0], 60) - 2 };
  }
  if (ex === 'p1235') {
    chords.forEach((c, i) => {
      const r = rootIn(c.pcs[0], 60), minor = c.quality === 'm7';
      [0, 2, minor ? 3 : 4, 7].forEach((d, k) => add(2 * i + Math.floor(k / 2) + (k % 2 ? 2 / 3 : 0), r + d, 'R', k % 2 === 1));
      add(2 * i, r - 12, 'L');
      labels.push({ beat: 2 * i, text: c.symbol });
    });
    return { notes, beats: 2 * chords.length, labels, swing: true, split: 58 };
  }
  // inversions: 8 beats per chord (root, 1st, 2nd, 3rd, 2nd, 1st, root, rest)
  chords.forEach((c, i) => {
    const r = rootIn(c.pcs[0], 55), s = QUALITIES[c.quality].semis;
    const inv = k => s.map((d, j) => r + d + (j < k ? 12 : 0));
    const names = ['root', '1st', '2nd', '3rd'];
    [0, 1, 2, 3, 2, 1, 0].forEach((k, b) => {
      inv(k).forEach(m => add(8 * i + b, m, 'R'));
      labels.push({ beat: 8 * i + b, text: b === 0 ? c.symbol : `${names[k]}·${noteLabel(c.notes[k])}` });
    });
  });
  return { notes, beats: 8 * chords.length, labels, swing: false, split: 0 };
}

export const technique = patternDrill({
  title: 'Technique',
  levelKey: cfg => `tech:${cfg.ex || 'arp'}:${(cfg.qualities || ['maj7']).join(',')}`,
  startTempo: cfg => cfg.tempo || 80,
  goal: cfg => cfg.goal || 4,
  sets(cfg) {
    const kind = cfg.ex || 'arp', q = cfg.qualities || ['maj7'];
    return Array.from({ length: setCount(kind, q) }, (_, k) => ({ id: String(k), label: setLabel(kind, q, k) }));
  },
  setStatus(cfg, id, P) {
    const st = P.keys.tech?.[`${cfg.ex || 'arp'}:${(cfg.qualities || ['maj7']).join(',')}`]?.[id];
    return st?.clean ? 'pass' : st?.tries ? 'tried' : '';
  },
  exercise: (cfg, id) => techExercise(cfg.ex || 'arp', cfg.qualities || ['maj7'], +id),
  how: cfg => ({ short: TECH[cfg.ex || 'arp'].short, long: TECH[cfg.ex || 'arp'].how }),
  record(ctx, id, r, bpm) {
    const { store, cfg } = ctx;
    const key = `${cfg.ex || 'arp'}:${(cfg.qualities || ['maj7']).join(',')}`;
    const st = (((store.progress.keys.tech ||= {})[key] ||= {})[id] ||= { tries: 0, clean: false, best: null });
    st.tries++;
    if (r.clean) st.clean = true;
    if (!st.best || r.accuracy > st.best.accuracy || (r.clean && bpm > st.best.bpm)) st.best = { accuracy: +r.accuracy.toFixed(3), bpm, clean: r.clean };
    store.save();
    store.log({ drill: 'technique', ex: cfg.ex, qualities: cfg.qualities, set: +id, bpm, accuracy: r.accuracy, clean: r.clean });
  },
  accompaniment(ex, bpm) {
    const b = 60 / bpm;
    return ex.swing ? swingGroove(ex.beats, bpm, { kick: false }) : Array.from({ length: ex.beats }, (_, i) => ({ t: i * b, kind: 'tick', level: i % 4 === 0 ? 1 : 0 }));
  },
});
