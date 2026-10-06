// Tempo levels for an exercise, remembered between days: a few clean takes in a row move you up a level
// (a little faster), a run of misses moves you back down one. Steps end on success, not on time:
// each step asks for a number of clean takes today.
export const UP_AFTER = 3, DOWN_AFTER = 3, STEP = 5;

export function ladder(store, key, { start = 80, min = 40, max = 220 } = {}) {
  const levels = (store.progress.levels ||= {});
  const L = (levels[key] ||= { bpm: start, streak: 0, misses: 0, best: 0 });
  const save = () => store.save();
  return {
    get bpm() { return L.bpm; },
    get streak() { return L.streak; },
    get best() { return L.best; },
    /** set the tempo by hand (the − / + buttons) */
    set(bpm) { L.bpm = Math.max(min, Math.min(max, bpm)); L.streak = 0; L.misses = 0; save(); },
    /** record a take: { up, down } says whether the level changed */
    record(clean) {
      let up = false, down = false;
      if (clean) {
        L.streak++; L.misses = 0; L.best = Math.max(L.best, L.bpm);
        if (L.streak >= UP_AFTER && L.bpm + STEP <= max) { L.bpm += STEP; L.streak = 0; up = true; }
      } else {
        L.streak = 0; L.misses++;
        if (L.misses >= DOWN_AFTER && L.bpm - STEP >= min) { L.bpm -= STEP; L.misses = 0; down = true; }
      }
      save();
      return { up, down, bpm: L.bpm };
    },
  };
}
