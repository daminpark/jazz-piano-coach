// Coordination Exercise 1 in any key: a two-octave major scale over left-hand quarter notes.
// Part 1 repeats every other note as triplets; part 2 drops the repeated note, which leaves swung eighths.
// A take is checked note by note, then for swing placement, offbeat accent and legato.
import { html } from '../html.js';
import { KEYS_FOURTHS, majorScale, noteLabel, parseNote, pcOf, midiName } from '../theory.js';
import { swingGroove } from '../audio.js';
import { coordPassed } from '../curriculum.js';
import { patternDrill } from './pattern.js';

const SEMIS = [0, 2, 4, 5, 7, 9, 11];
export const GATE_BPM = 100;

/** the exercise as expected notes {beat, midi, hand, partial} over 16 beats (4 bars) */
export function coordExercise(key, part) {
  const pc = pcOf(parseNote(key));
  const tonic = 55 + ((pc - 7 + 12) % 12); // between G3 and F♯4
  const s = Array.from({ length: 15 }, (_, d) => tonic + SEMIS[d % 7] + 12 * Math.floor(d / 7));
  const notes = [];
  const rh = (beat, midi, partial) => notes.push({ beat: beat + partial, midi, hand: 'R', partial, beatIdx: beat, off: Math.abs(partial - 2 / 3) < 0.01 });
  for (let k = 0; k < 7; k++) {
    if (part === 1) { rh(k, s[2 * k], 0); rh(k, s[2 * k], 1 / 3); rh(k, s[2 * k + 1], 2 / 3); }
    else { rh(k, s[2 * k], 0); rh(k, s[2 * k + 1], 2 / 3); }
  }
  rh(7, s[14], 0);
  for (let j = 0; j < 7; j++) {
    const b = 8 + j;
    if (part === 1) { rh(b, s[14 - 2 * j], 0); rh(b, s[14 - 2 * j], 1 / 3); rh(b, s[13 - 2 * j], 2 / 3); }
    else { rh(b, s[14 - 2 * j], 0); rh(b, s[13 - 2 * j], 2 / 3); }
  }
  rh(15, s[0], 0);
  for (let b = 0; b < 16; b++) notes.push({ beat: b, midi: tonic - 12, hand: 'L', partial: 0, beatIdx: b });
  return { notes: notes.sort((a, b) => a.beat - b.beat), tonic, scale: s, beats: 16, swing: true, split: tonic - 2, tol: part === 1 ? 0.16 : 0.25, legato: part === 2 ? undefined : false };
}

export const coord = patternDrill({
  title: 'Coordination Exercise 1',
  levelKey: cfg => `coord:p${cfg.part || 2}`,
  startTempo: cfg => cfg.tempo || 90,
  minAccuracy: 0.95,
  offbeat: cfg => (cfg.part === 1 ? 'third partial' : 'offbeat'),
  sets(cfg, P) {
    const part = cfg.part || 2;
    const list = cfg.keys === 'unpassed' ? KEYS_FOURTHS.filter(k => !coordPassed(P, k, part)) : (cfg.keys || KEYS_FOURTHS);
    return (list.length ? list : KEYS_FOURTHS).map(k => ({ id: k, label: noteLabel(parseNote(k)) }));
  },
  goal: (cfg, sets) => cfg.goal || (cfg.keys === 'unpassed' ? sets.length : Math.max(3, sets.length * 2)),
  setStatus(cfg, k, P) { const s = P.keys.coord1?.[k]?.[`p${cfg.part || 2}`]; return s?.passed ? 'pass' : s?.tries ? 'tried' : ''; },
  exercise(cfg, k) {
    const part = cfg.part || 2, ex = coordExercise(k, part);
    ex.sub = `${noteLabel(parseNote(k))} major: ${majorScale(k).map(noteLabel).join(' ')} · left hand ${midiName(ex.tonic - 12)}`;
    return ex;
  },
  how(cfg) {
    const part = cfg.part || 2;
    return part === 1
      ? { short: 'Right hand: the scale two octaves up and down, every other note played twice, three notes per beat. Left hand: quarter notes on the tonic.',
        long: 'Each beat has three notes: the repeated note twice, then the next note. Lean on the third note of each group (it lands where a swung offbeat goes) and keep the first two light. The left hand keeps steady quarter notes on the tonic an octave below. One bar of count-in, then four bars.' }
      : { short: 'Right hand: the scale two octaves up and down in swung eighths. Left hand: quarter notes on the tonic.',
        long: 'Part 2 drops the repeated note from part 1: keep hearing the triplet underneath, so each offbeat lands on its last third (about 67% of the beat). Every offbeat a little louder than the note on the beat (doo-VAH), legato throughout. Pass a key at ♩ = 100 or faster for the Unit 1 gate.' };
  },
  record(ctx, k, r, bpm) {
    const { store, cfg } = ctx, part = cfg.part || 2, P = store.progress;
    const s = (((P.keys.coord1 ||= {})[k] ||= {})[`p${part}`] ||= { tries: 0, passed: false, best: null });
    s.tries++;
    const summary = { bpm, accuracy: +r.accuracy.toFixed(3), placement: r.stats?.placement && +r.stats.placement.toFixed(3), at: Date.now() };
    if (r.clean && (part === 1 || bpm >= GATE_BPM)) s.passed = true;
    if (!s.best || (r.clean && (!s.best.clean || bpm > s.best.bpm)) || (!s.best.clean && r.accuracy > s.best.accuracy)) s.best = { ...summary, clean: r.clean };
    s.last = summary;
    store.save();
    store.log({ drill: 'coord', key: k, part, ...summary, clean: r.clean });
  },
  accompaniment(ex, bpm, S) {
    const feel = S.coordFeel || 'click24', b = 60 / bpm;
    if (feel === 'groove') return swingGroove(ex.beats, bpm, { kick: false });
    return Array.from({ length: ex.beats }, (_, i) => i).filter(i => feel === 'click' || i % 2 === 1).map(i => ({ t: i * b, kind: 'tick', level: feel === 'click' && i % 4 === 0 ? 1 : 0 }));
  },
  controls(S, running) {
    const feel = S.coordFeel || 'click24';
    return html`<select data-a="feel" ${running ? 'disabled' : ''} aria-label="Accompaniment">
      ${[['click24', 'Click on 2 & 4'], ['click', 'Click every beat'], ['groove', 'Ride cymbal']].map(([v, l]) => html`<option value="${v}" ${feel === v ? 'selected' : ''}>${l}</option>`)}</select>`;
  },
  wire(el, S, redraw, store) { const f = el.querySelector('[data-a=feel]'); if (f) f.onchange = e => { S.coordFeel = e.target.value; store.save(); }; },
});
