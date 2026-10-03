// The study path, in the order of Jeremy Siskind's "Jazz Piano Fundamentals, Book 1". Each unit has ~30-minute
// days (a lesson written for this app, then drills) and gates: tests that show when you're ready to move on.
import { deck, KEYS_FOURTHS } from './theory.js';

export const BOOK = 'Jazz Piano Fundamentals, Book 1 (Jeremy Siskind, 2021)';

const median = xs => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : Infinity; };
export const cardTime = c => (c && c.times && c.times.length ? median(c.times.slice(-3)) : Infinity);
export const coordPassed = (P, key, part = 2) => !!(P.keys.coord1 && P.keys.coord1[key] && P.keys.coord1[key][`p${part}`] && P.keys.coord1[key][`p${part}`].passed);

export const TRACKS = {
  freddie: {
    title: 'Freddie Freeloader', artist: 'Miles Davis', album: 'Kind of Blue (1959)', bpm: 128,
    personnel: ['Miles Davis, trumpet', 'John Coltrane, tenor sax', 'Cannonball Adderley, alto sax', 'Wynton Kelly, piano', 'Paul Chambers, bass', 'Jimmy Cobb, drums'],
    // a 12-bar blues in B♭ (the solos use the first ending)
    form: ['B♭7', 'B♭7', 'B♭7', 'B♭7', 'E♭7', 'E♭7', 'B♭7', 'B♭7', 'F7', 'E♭7', 'A♭7', 'A♭7'],
    map: [
      { label: 'Head', who: 'band', from: 0, to: 44, choruses: 2 },
      { label: 'Piano solo', who: 'Wynton Kelly', from: 44, to: 134, choruses: 4 },
      { label: 'Trumpet solo', who: 'Miles Davis', from: 134, to: 270, choruses: 6 },
      { label: 'Tenor sax solo', who: 'John Coltrane', from: 270, to: 381, choruses: 5 },
      { label: 'Alto sax solo', who: 'Cannonball Adderley', from: 381, to: 493, choruses: 5 },
      { label: 'Bass solo', who: 'Paul Chambers', from: 493, to: 535, choruses: 2 },
      { label: 'Head', who: 'band', from: 535, to: 580, choruses: 2 },
    ],
    quiz: [
      { q: 'How many bars long is one chorus of the solos?', a: ['8', '12', '16', '24'], ok: 1 },
      { q: 'Who takes the first solo?', a: ['Miles Davis', 'John Coltrane', 'Wynton Kelly', 'Cannonball Adderley'], ok: 2 },
      { q: 'How many choruses does Miles Davis play?', a: ['2', '4', '6', '8'], ok: 2 },
      { q: 'What is the bass doing for most of the track?', a: ['Long held notes', 'Walking quarter notes', 'Playing the melody', 'Resting'], ok: 1 },
      { q: 'What is the order of a typical jazz performance (the “sandwich”)?', a: ['Solos, head, solos', 'Head, solos, head', 'Intro, head, outro', 'Head, head, solos'], ok: 1 },
    ],
  },
};

const ALL3 = ['maj7', '7', 'm7'];
const step = (drill, min, cfg = {}) => ({ drill, min, ...cfg });

export const UNITS = [
  {
    id: 1, title: 'Getting Oriented',
    about: 'Drone improvisation, the basics of swing feel, chord symbols, and the three essential seventh chords. First guided listening: Miles Davis, “Freddie Freeloader”.',
    gates: [
      { id: 'cards', label: 'Find all 36 seventh chords (maj7, 7, m7) in under 3 seconds each',
        progress: P => { const d = deck(ALL3); const ok = d.filter(c => cardTime(P.cards[c.id]) < 3000).length; return { done: ok, of: d.length }; } },
      { id: 'coord', label: 'Coordination Exercise 1 (swung eighths) clean and swinging in all 12 keys at ♩ = 100+',
        progress: P => ({ done: KEYS_FOURTHS.filter(k => coordPassed(P, k, 2)).length, of: 12 }) },
      { id: 'swing', label: 'A swing check that passes: triplet placement, offbeat accent, legato',
        progress: P => ({ done: (P.swing || []).some(s => s.passed) ? 1 : 0, of: 1 }) },
      { id: 'drone', label: 'Five drone improvisation sessions',
        progress: P => ({ done: Math.min(5, P.drone || 0), of: 5 }) },
      { id: 'listen', label: '“Freddie Freeloader”: form quiz passed (and keep listening: aim for 20 times)',
        progress: P => ({ done: P.quizzes.freddie && P.quizzes.freddie.passed ? 1 : 0, of: 1 }) },
    ],
    days: [
      { title: 'Getting oriented', steps: [
        step('lesson', 10, { lesson: 'u1-welcome' }),
        step('drone', 5, { focus: ['listen'] }),
        step('chords', 7, { qualities: ['maj7'], count: 12, label: 'Major seventh chords' }),
        step('listen', 8, { track: 'freddie', note: 'First listen: just follow the form with the bar counter. Count the choruses.' }),
      ] },
      { title: 'Swing feel', steps: [
        step('lesson', 6, { lesson: 'u1-swing' }),
        step('drone', 4, { focus: ['phrases'] }),
        step('coord', 7, { keys: ['C', 'F'], part: 1, tempo: 80, note: 'Part 1: the repeated-note triplets. Lean on the third note of each group.' }),
        step('chords', 5, { qualities: ['maj7', '7'], count: 16, label: 'Major and dominant sevenths' }),
        step('swing', 4, { exercises: ['A', 'B'], tempo: 100 }),
        step('listen', 4, { track: 'freddie' }),
      ] },
      { title: 'Swung eighths', steps: [
        step('lesson', 5, { lesson: 'u1-minor' }),
        step('drone', 4, { focus: ['rhythm'] }),
        step('coord', 8, { keys: ['C', 'F', 'Bb'], part: 2, tempo: 90, note: 'Part 2: drop the repeated note and keep hearing it. Swung eighths.' }),
        step('chords', 5, { qualities: ['m7'], count: 12, label: 'Minor seventh chords' }),
        step('swing', 4, { exercises: ['C', 'D'], tempo: 100 }),
        step('listen', 4, { track: 'freddie' }),
      ] },
      { title: 'All 36 chords', steps: [
        step('lesson', 5, { lesson: 'u1-spelling' }),
        step('drone', 4, { focus: ['listen', 'phrases', 'rhythm'] }),
        step('coord', 7, { keys: ['Eb', 'Ab'], part: 2, tempo: 90 }),
        step('spell', 5, { qualities: ALL3, count: 12, note: 'Spell each chord with the right letter names (E♯ is not F!).' }),
        step('chords', 5, { qualities: ALL3, count: 20 }),
        step('listen', 4, { track: 'freddie' }),
      ] },
      { title: 'Vamp pieces', steps: [
        step('lesson', 5, { lesson: 'u1-vamp' }),
        step('drone', 4, { focus: ['listen', 'phrases', 'rhythm'] }),
        step('coord', 7, { keys: ['Db', 'Gb'], part: 2, tempo: 95 }),
        step('chords', 4, { qualities: ALL3, count: 16 }),
        step('vamp', 6, { qualities: ALL3, beatsPerChord: 8, tempo: 100, note: 'Four chords, two bars each, over bass and drums.' }),
        step('listen', 4, { track: 'freddie' }),
      ] },
      { title: 'The blues form', steps: [
        step('lesson', 5, { lesson: 'u1-form' }),
        step('drone', 4, { focus: ['phrases', 'rhythm'] }),
        step('coord', 7, { keys: ['B', 'E'], part: 2, tempo: 100 }),
        step('chords', 4, { qualities: ALL3, count: 16, slowestFirst: true, label: 'Your slowest chords first' }),
        step('vamp', 5, { qualities: ALL3, beatsPerChord: 4, tempo: 100, note: 'One bar per chord now.' }),
        step('swing', 5, { exercises: ['E'], tempo: 110 }),
      ] },
      { title: 'All twelve keys', steps: [
        step('lesson', 5, { lesson: 'u1-listening' }),
        step('drone', 4, { focus: ['listen', 'phrases', 'rhythm'] }),
        step('coord', 8, { keys: ['A', 'D', 'G'], part: 2, tempo: 100 }),
        step('chords', 4, { qualities: ALL3, count: 16, slowestFirst: true }),
        step('vamp', 5, { qualities: ALL3, beatsPerChord: 2, tempo: 100, note: 'Two beats per chord: find them fast.' }),
        step('listen', 4, { track: 'freddie', quiz: true }),
      ] },
      { title: 'Unit 1 check', check: true, steps: [
        step('lesson', 3, { lesson: 'u1-review' }),
        step('chords', 7, { qualities: ALL3, count: 36, test: true, label: 'All 36 chords, timed' }),
        step('coord', 11, { keys: 'unpassed', part: 2, tempo: 100, note: 'Every key that hasn’t passed yet (all 12 count toward the gate).' }),
        step('swing', 5, { exercises: 'any', tempo: 110 }),
        step('listen', 4, { track: 'freddie', quiz: true }),
      ] },
    ],
  },
];

/** flatten to a list of days with unit info; a unit's later units are locked until its gates pass */
export function allDays() {
  const out = [];
  for (const u of UNITS) u.days.forEach((d, i) => out.push({ ...d, unit: u, index: out.length + 1, inUnit: i + 1 }));
  return out;
}
export const gateStatus = (unit, P) => unit.gates.map(g => ({ ...g, ...g.progress(P) })).map(g => ({ ...g, passed: g.done >= g.of }));

/**
 * Day n (1-based). Past the last written day: catch-up days aimed at whichever gates aren't met yet,
 * or once they all pass, "keep it warm" review days until the next unit is added.
 */
export function dayAt(n, P) {
  const days = allDays();
  if (n <= days.length) return days[n - 1];
  const unit = UNITS[UNITS.length - 1];
  const unmet = new Set(gateStatus(unit, P).filter(g => !g.passed).map(g => g.id));
  const rot = KEYS_FOURTHS.map((_, k) => KEYS_FOURTHS[(k + n * 3) % 12]);
  const steps = [step('drone', 5, { focus: ['listen', 'phrases', 'rhythm'] })];
  if (unmet.size) {
    if (unmet.has('cards')) steps.push(step('chords', 7, { qualities: ALL3, count: 24, slowestFirst: true, label: 'Your slowest chords first' }));
    if (unmet.has('coord')) steps.push(step('coord', 10, { keys: 'unpassed', part: 2, tempo: 100, note: 'Only the keys that haven’t passed yet.' }));
    if (unmet.has('swing')) steps.push(step('swing', 5, { exercises: 'any', tempo: 100 }));
    if (unmet.has('listen')) steps.push(step('listen', 5, { track: 'freddie', quiz: true }));
    if (!unmet.has('cards')) steps.push(step('vamp', 5, { qualities: ALL3, beatsPerChord: 2, tempo: 110 }));
    return { title: `Catch-up: Unit ${unit.id} gates`, catchUp: true, unit, index: n, inUnit: n - days.length + unit.days.length, steps };
  }
  steps.push(
    step('chords', 6, { qualities: ALL3, count: 36, test: true, label: 'All 36 chords, timed' }),
    step('coord', 8, { keys: rot.slice(0, 3), part: 2, tempo: 120, note: 'Review a few keys, a little faster.' }),
    step('vamp', 6, { qualities: ALL3, beatsPerChord: 1, tempo: 100, note: 'One chord per beat.' }),
    step('listen', 5, { track: 'freddie' }),
  );
  return { title: 'Keep it warm', review: true, unit, index: n, inUnit: n - days.length + unit.days.length, steps };
}
export const minutesOf = day => day.steps.reduce((s, x) => s + x.min, 0);
