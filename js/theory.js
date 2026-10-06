// Music theory: spelled notes, chords and scales in any key. Pure functions, no DOM.
export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACC = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };
const ACC_ASCII = { '-2': 'bb', '-1': 'b', 0: '', 1: '#', 2: '##' };

/** "Eb" / "F#" / "Bbb" -> {letter, acc} */
export function parseNote(s) {
  const m = s.match(/^([A-G])(bb|b|##|#|x|♭|♯)?$/);
  if (!m) throw new Error('bad note ' + s);
  const acc = { bb: -2, b: -1, '♭': -1, '#': 1, '♯': 1, '##': 2, x: 2 }[m[2] || ''] ?? 0;
  return { letter: m[1], acc };
}
export const pcOf = n => (((LETTER_PC[n.letter] + n.acc) % 12) + 12) % 12;
export const noteLabel = n => n.letter + ACC[n.acc];
export const noteAscii = n => n.letter + ACC_ASCII[n.acc];
export const midiName = m => ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][m % 12] + (Math.floor(m / 12) - 1);

/** spell a note `semis` above `root`, `steps` letters above it (e.g. a major 3rd = 4 semis, 2 letters) */
export function spellAbove(root, semis, steps) {
  const li = (LETTERS.indexOf(root.letter) + steps) % 7;
  const letter = LETTERS[li];
  let acc = ((pcOf(root) + semis - LETTER_PC[letter]) % 12 + 12) % 12;
  if (acc > 6) acc -= 12;
  return { letter, acc };
}

// chord qualities: semitones + letter steps from the root, and how they're written
export const QUALITIES = {
  maj7: { name: 'major seventh', semis: [0, 4, 7, 11], steps: [0, 2, 4, 6], sym: 'maj7' },
  7: { name: 'dominant seventh', semis: [0, 4, 7, 10], steps: [0, 2, 4, 6], sym: '7' },
  m7: { name: 'minor seventh', semis: [0, 3, 7, 10], steps: [0, 2, 4, 6], sym: 'm7' },
  m7b5: { name: 'half-diminished', semis: [0, 3, 6, 10], steps: [0, 2, 4, 6], sym: 'm7♭5' },
  dim7: { name: 'diminished seventh', semis: [0, 3, 6, 9], steps: [0, 2, 4, 6], sym: '°7' },
  6: { name: 'major sixth', semis: [0, 4, 7, 9], steps: [0, 2, 4, 5], sym: '6' },
  m6: { name: 'minor sixth', semis: [0, 3, 7, 9], steps: [0, 2, 4, 5], sym: 'm6' },
};

// roots as commonly written in lead sheets, per quality
const ROOTS_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const ROOTS_MINOR = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
export const rootsFor = q => (q === 'm7' || q === 'm6' || q === 'm7b5' ? ROOTS_MINOR : ROOTS_FLAT).map(parseNote);

export function chord(rootName, quality) {
  const root = typeof rootName === 'string' ? parseNote(rootName) : rootName;
  const Q = QUALITIES[quality];
  const notes = Q.semis.map((s, i) => spellAbove(root, s, Q.steps[i]));
  return {
    id: `${noteAscii(root)}${quality}`, root, quality, notes,
    pcs: notes.map(pcOf), symbol: noteLabel(root) + Q.sym, rootLabel: noteLabel(root), qualityLabel: Q.sym,
  };
}

/** all 12 roots × the given qualities */
export const deck = qualities => qualities.flatMap(q => rootsFor(q).map(r => chord(r, q)));

// keys in the order jazz musicians usually cycle them (around the circle of fourths)
export const KEYS_FOURTHS = ['C', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'B', 'E', 'A', 'D', 'G'];

/** major scale of a key, spelled */
export function majorScale(keyName) {
  const root = parseNote(keyName);
  return [0, 2, 4, 5, 7, 9, 11].map((s, i) => spellAbove(root, s, i));
}

/** does a set of held MIDI notes spell exactly this chord's pitch classes (any octave/inversion)? */
export function matchesChord(heldMidis, ch, { rootPosition = false } = {}) {
  if (!heldMidis.length) return false;
  const pcs = new Set(heldMidis.map(m => m % 12));
  if (pcs.size !== ch.pcs.length || ch.pcs.some(p => !pcs.has(p))) return false;
  if (rootPosition) return Math.min(...heldMidis) % 12 === ch.pcs[0];
  return true;
}

// triads too, so a readout can name an incomplete chord
const TRIADS = { '': { semis: [0, 4, 7], steps: [0, 2, 4] }, m: { semis: [0, 3, 7], steps: [0, 2, 4] }, dim: { semis: [0, 3, 6], steps: [0, 2, 4] }, aug: { semis: [0, 4, 8], steps: [0, 2, 4] } };
const NAME_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].map(parseNote);

/** name the chord a set of held notes makes (any inversion): "A7", "Cmaj7", "F♯m"... or null */
export function identify(heldMidis) {
  const pcs = new Set(heldMidis.map(m => m % 12));
  if (pcs.size < 3) return null;
  const bass = Math.min(...heldMidis) % 12;
  const found = [];
  const tables = [...Object.entries(QUALITIES).map(([q, Q]) => [Q.sym, Q.semis]), ...Object.entries(TRIADS).map(([s, T]) => [s, T.semis])];
  for (const root of NAME_ROOTS) {
    const r = pcOf(root);
    for (const [sym, semis] of tables) {
      if (semis.length !== pcs.size || !semis.every(s => pcs.has((r + s) % 12))) continue;
      found.push({ name: noteLabel(root) + sym, rootIsBass: r === bass });
    }
  }
  if (!found.length) return null;
  found.sort((a, b) => b.rootIsBass - a.rootIsBass); // C6 and Am7 are the same notes: prefer the one whose root is in the bass
  return found[0].name;
}

/** held notes as names, lowest first, using the target chord's spelling where it matches */
export function heldNames(heldMidis, target) {
  const spell = target ? Object.fromEntries(target.pcs.map((pc, k) => [pc, noteLabel(target.notes[k])])) : {};
  const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
  const seen = new Set();
  return heldMidis.slice().sort((a, b) => a - b).filter(m => !seen.has(m % 12) && seen.add(m % 12)).map(m => spell[m % 12] || NAMES[m % 12]);
}

// ---- voice leading: how far the hand moves between two voicings ----
/** semitones moved from voicing a to voicing b (notes paired lowest to lowest; else each new note to the nearest old one) */
export function movement(a, b) {
  const A = a.slice().sort((x, y) => x - y), B = b.slice().sort((x, y) => x - y);
  if (A.length === B.length) return A.reduce((s, x, i) => s + Math.abs(x - B[i]), 0);
  return B.reduce((s, x) => s + Math.min(...A.map(y => Math.abs(x - y))), 0);
}
/** every close-position voicing of a chord (each inversion, each octave) with its lowest note in [lo, hi] */
export function closeVoicings(ch, lo = 50, hi = 74) {
  const out = [];
  for (let k = 0; k < ch.pcs.length; k++) {
    const rel = ch.pcs.map((_, j) => (ch.pcs[(k + j) % ch.pcs.length] - ch.pcs[k] + 12) % 12);
    for (let bass = lo; bass <= hi; bass++) if (bass % 12 === ch.pcs[k]) out.push(rel.map(r => bass + r));
  }
  return out;
}
/** the close voicing of ch that moves least from prev */
export function closestVoicing(prev, ch) {
  let best = null, cost = Infinity;
  for (const v of closeVoicings(ch)) { const c = movement(prev, v); if (c < cost) { cost = c; best = v; } }
  return { voicing: best, cost };
}
