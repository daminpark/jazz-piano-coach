// The study path, in the order of Jeremy Siskind's "Jazz Piano Fundamentals, Book 1". Each unit has ~30-minute
// days (a lesson written for this app, then drills) and gates: tests that show when you're ready to move on.
import { deck, KEYS_FOURTHS } from './theory.js';
import { FREDDIE_BARS } from './content/freddie-bars.js';

export const BOOK = 'Jazz Piano Fundamentals, Book 1 (Jeremy Siskind, 2021)';

const median = xs => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : Infinity; };
export const cardTime = c => (c && c.times && c.times.length ? median(c.times.slice(-3)) : Infinity);
export const coordPassed = (P, key, part = 2) => !!(P.keys.coord1 && P.keys.coord1[key] && P.keys.coord1[key][`p${part}`] && P.keys.coord1[key][`p${part}`].passed);

export const TRACKS = {
  freddie: {
    title: 'Freddie Freeloader', artist: 'Miles Davis', album: 'Kind of Blue (1959)', bpm: 128, length: 586,
    youtube: 'ZZcuSBouhVA', // official audio, MilesDavisVEVO
    // one focus per listen, in order (the book suggests about 20 listens)
    tasks: [
      { text: 'Count the choruses. Each time the 12-bar grid starts over, a new chorus begins. Does what you hear match the counter?' },
      { text: 'Listen for bar 5 of every chorus, where the chord moves to E♭7 and the music lifts. Say “five” out loud each time it arrives.', from: 0, to: FREDDIE_BARS[72], label: 'head and piano solo' },
      { text: 'Follow the bass: one note per beat. Notice where it goes at bar 9 (F7) and bar 11 (A♭7).', from: FREDDIE_BARS[72], to: FREDDIE_BARS[144], label: 'trumpet solo' },
      { text: 'Listen only to the piano behind Coltrane. When does Wynton Kelly play, and when does he leave space? Are his chords long or short?', from: FREDDIE_BARS[144], to: FREDDIE_BARS[204], label: 'tenor sax solo' },
      { text: 'Listen to the ride cymbal: “ding, ding-a, ding, ding-a”. Tap along with the “-a”, the swung offbeat.', from: FREDDIE_BARS[24], to: FREDDIE_BARS[72], label: 'piano solo' },
      { text: 'Compare two soloists: Miles plays few notes with lots of space, Coltrane is dense and fast. Which do you like, and why?', from: 200, to: 330, label: 'Miles into Coltrane' },
      { text: 'Sing the melody along with the band, both times through. Then hum it from memory.', from: 0, to: FREDDIE_BARS[24], label: 'the head' },
      { text: 'How does one solo hand over to the next? Listen for the last phrase of Coltrane and the first of Cannonball.', from: 345, to: 430, label: 'Coltrane into Cannonball' },
      { text: 'Kelly’s solo: what does his left hand do while the right hand plays the line? Listen for the short chord stabs.', from: FREDDIE_BARS[24], to: FREDDIE_BARS[72], label: 'piano solo' },
      { text: 'Free listen: the whole track. Notice one thing you hadn’t heard before.' },
    ],
    personnel: ['Miles Davis, trumpet', 'John Coltrane, tenor sax', 'Cannonball Adderley, alto sax', 'Wynton Kelly, piano', 'Paul Chambers, bass', 'Jimmy Cobb, drums'],
    // a 12-bar blues in B♭ (the solos use the first ending)
    form: ['B♭7', 'B♭7', 'B♭7', 'B♭7', 'E♭7', 'E♭7', 'B♭7', 'B♭7', 'F7', 'E♭7', 'A♭7', 'A♭7'],
    bars: FREDDIE_BARS, // measured bar starts: the follower stays on the beat
    map: [
      { label: 'Head', who: 'band', from: 0, to: FREDDIE_BARS[24], choruses: 2 },
      { label: 'Piano solo', who: 'Wynton Kelly', from: FREDDIE_BARS[24], to: FREDDIE_BARS[72], choruses: 4 },
      { label: 'Trumpet solo', who: 'Miles Davis', from: FREDDIE_BARS[72], to: FREDDIE_BARS[144], choruses: 6 },
      { label: 'Tenor sax solo', who: 'John Coltrane', from: FREDDIE_BARS[144], to: FREDDIE_BARS[204], choruses: 5 },
      { label: 'Alto sax solo', who: 'Cannonball Adderley', from: FREDDIE_BARS[204], to: FREDDIE_BARS[264], choruses: 5 },
      { label: 'Bass solo', who: 'Paul Chambers', from: FREDDIE_BARS[264], to: FREDDIE_BARS[288], choruses: 2 },
      { label: 'Head', who: 'band', from: FREDDIE_BARS[288], to: FREDDIE_BARS[312], choruses: 2 },
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
        step('lesson', 8, { lesson: 'u1-welcome' }),
        step('drone', 5, { focus: ['listen'] }),
        step('technique', 6, { ex: 'arp', qualities: ['maj7'], tempo: 70 }),
        step('chords', 5, { qualities: ['maj7'], count: 12, label: 'Major seventh chords' }),
        step('listen', 6, { track: 'freddie', note: 'Count the choruses: each time the 12-bar grid starts over, a new chorus begins. Does what you hear match the counter?' }),
      ] },
      { title: 'Swing feel', steps: [
        step('lesson', 5, { lesson: 'u1-swing' }),
        step('drone', 4, { focus: ['phrases'] }),
        step('technique', 5, { ex: 'arp', qualities: ['7'], tempo: 75 }),
        step('coord', 7, { keys: ['C', 'F'], part: 1, tempo: 80, note: 'Part 1: the repeated-note triplets. Lean on the third note of each group.' }),
        step('chords', 5, { qualities: ['maj7', '7'], count: 16, label: 'Major and dominant sevenths' }),
        step('swing', 4, { exercises: ['A', 'B'], tempo: 100 }),
      ] },
      { title: 'Swung eighths', steps: [
        step('lesson', 5, { lesson: 'u1-minor' }),
        step('drone', 4, { focus: ['rhythm'] }),
        step('technique', 5, { ex: 'arp', qualities: ['m7'], tempo: 75 }),
        step('coord', 7, { keys: ['C', 'F', 'Bb'], part: 2, tempo: 90, note: 'Part 2: drop the repeated note and keep hearing it. Swung eighths.' }),
        step('chords', 4, { qualities: ['m7'], count: 12, label: 'Minor seventh chords' }),
        step('listen', 5, { track: 'freddie' }),
      ] },
      { title: 'Closest inversion', steps: [
        step('lesson', 4, { lesson: 'u1-inversions' }),
        step('drone', 3, { focus: ['phrases', 'rhythm'] }),
        step('lead', 7, { progression: 'random', qualities: ['maj7', '7'], goal: 20 }),
        step('lead', 6, { progression: 'iiVI', goal: 15 }),
        step('coord', 6, { keys: ['C', 'F', 'Bb'], part: 2, tempo: 90, goal: 3 }),
        step('listen', 4, { track: 'freddie' }),
      ] },
      { title: 'All 36 chords', steps: [
        step('lesson', 5, { lesson: 'u1-spelling' }),
        step('drone', 4, { focus: ['listen', 'phrases', 'rhythm'] }),
        step('technique', 4, { ex: 'p1235', qualities: ['m7'], tempo: 80 }),
        step('coord', 6, { keys: ['Eb', 'Ab'], part: 2, tempo: 90 }),
        step('spell', 4, { qualities: ALL3, count: 12, note: 'Spell each chord with the right letter names (E♯ is not F!).' }),
        step('lead', 4, { progression: 'random', qualities: ALL3, goal: 16 }),
        step('swing', 3, { exercises: ['C', 'D'], tempo: 100 }),
      ] },
      { title: 'Vamp pieces', steps: [
        step('lesson', 5, { lesson: 'u1-vamp' }),
        step('drone', 4, { focus: ['listen', 'phrases', 'rhythm'] }),
        step('technique', 4, { ex: 'p1235', qualities: ['maj7'], tempo: 80 }),
        step('coord', 5, { keys: ['Db', 'Gb'], part: 2, tempo: 95 }),
        step('lead', 4, { progression: 'fourths', qualities: ['7'], goal: 16 }),
        step('vamp', 5, { qualities: ALL3, beatsPerChord: 8, tempo: 100, note: 'Four chords, two bars each, over bass and drums. Try them in inversions, close together.' }),
        step('listen', 4, { track: 'freddie' }),
      ] },
      { title: 'The blues form', steps: [
        step('lesson', 5, { lesson: 'u1-form' }),
        step('drone', 4, { focus: ['phrases', 'rhythm'] }),
        step('technique', 5, { ex: 'p1235', qualities: ['7'], tempo: 80 }),
        step('coord', 6, { keys: ['B', 'E'], part: 2, tempo: 100 }),
        step('lead', 4, { progression: 'blues', goal: 16 }),
        step('vamp', 3, { qualities: ALL3, beatsPerChord: 4, tempo: 100, note: 'One bar per chord now.' }),
        step('swing', 3, { exercises: ['E'], tempo: 110 }),
      ] },
      { title: 'All twelve keys', steps: [
        step('lesson', 5, { lesson: 'u1-listening' }),
        step('drone', 4, { focus: ['listen', 'phrases', 'rhythm'] }),
        step('technique', 5, { ex: 'arp', qualities: ['maj7', '7', 'm7'], tempo: 80, note: 'One root, three colours: maj7, 7 and m7 in turn.' }),
        step('coord', 7, { keys: ['A', 'D', 'G'], part: 2, tempo: 100 }),
        step('vamp', 4, { qualities: ALL3, beatsPerChord: 2, tempo: 100, note: 'Two beats per chord: find them fast.' }),
        step('listen', 5, { track: 'freddie', quiz: true }),
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
  const tech = [['arp', ['maj7', '7', 'm7']], ['p1235', ['m7']], ['inv', ['7']], ['p1235', ['7']], ['arp', ['m7']], ['inv', ['m7']]][n % 6];
  const steps = [step('drone', 5, { focus: ['listen', 'phrases', 'rhythm'] })];
  if (unmet.size < 3) steps.push(step('technique', 5, { ex: tech[0], qualities: tech[1], tempo: 90 }));
  if (unmet.size) {
    if (unmet.has('cards')) steps.push(step('chords', 6, { qualities: ALL3, count: 24, slowestFirst: true, label: 'Your slowest chords first' }));
    if (unmet.has('coord')) steps.push(step('coord', 10, { keys: 'unpassed', part: 2, tempo: 100, note: 'Only the keys that haven’t passed yet.' }));
    if (unmet.has('swing')) steps.push(step('swing', 5, { exercises: 'any', tempo: 100 }));
    if (unmet.has('listen')) steps.push(step('listen', 5, { track: 'freddie', quiz: true }));
    if (!unmet.has('cards') && steps.length < 5) steps.push(step('vamp', 5, { qualities: ALL3, beatsPerChord: 2, tempo: 110 }));
    return { title: `Catch-up: Unit ${unit.id} gates`, catchUp: true, unit, index: n, inUnit: n - days.length + unit.days.length, steps };
  }
  steps.push(
    step('chords', 6, { qualities: ALL3, count: 36, test: true, label: 'All 36 chords, timed' }),
    step('coord', 6, { keys: rot.slice(0, 3), part: 2, tempo: 120, note: 'Review a few keys, a little faster.' }),
    step('vamp', 4, { qualities: ALL3, beatsPerChord: 1, tempo: 100, note: 'One chord per beat.' }),
    step('listen', 4, { track: 'freddie' }),
  );
  return { title: 'Keep it warm', review: true, unit, index: n, inUnit: n - days.length + unit.days.length, steps };
}
export const minutesOf = day => day.steps.reduce((s, x) => s + x.min, 0);
