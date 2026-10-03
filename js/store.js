// Persistence in localStorage (progress, drill stats, settings). Never throws.
const KEY = 'jazz-piano-coach-v1';
const DEFAULTS = () => ({
  settings: { minutesPerDay: 30, midiIn: null, volume: 0.8, echo: false, theme: null, groove: true },
  progress: { day: 1, days: {}, minutes: {}, cards: {}, keys: {}, listens: {}, quizzes: {}, drone: 0, swing: [], results: [] },
});
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS();
    const d = JSON.parse(raw); const def = DEFAULTS();
    return { ...def, ...d, settings: { ...def.settings, ...(d.settings || {}) }, progress: { ...def.progress, ...(d.progress || {}) } };
  } catch { return DEFAULTS(); }
}
const dateKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const store = {
  data: load(),
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.data)); } catch (e) { console.warn('save failed', e); } },
  get settings() { return this.data.settings; },
  get progress() { return this.data.progress; },
  reset() { this.data = DEFAULTS(); this.save(); },
  today() { return dateKey(new Date()); },
  addMinutes(sec) { const t = this.today(); const m = this.progress.minutes; m[t] = (m[t] || 0) + sec / 60; this.save(); },
  streak() {
    const m = this.progress.minutes; let n = 0; const d = new Date();
    if (!(m[dateKey(d)] >= 1)) d.setDate(d.getDate() - 1);
    while ((m[dateKey(d)] || 0) >= 5) { n++; d.setDate(d.getDate() - 1); }
    return n;
  },
  log(result) {
    const r = this.progress.results; r.push({ ...result, at: Date.now() });
    if (r.length > 300) r.splice(0, r.length - 300);
    this.save();
  },
};
