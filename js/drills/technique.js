// Technique: generated exercises through the keys, checked note by note against a count-in
// (and for swung ones, where the offbeats land and whether they're accented).
//   arp   seventh-chord arpeggios 1-3-5-7-8-7-5-3, one bar per chord, left hand holding the root
//   p1235 the 1-2-3-5 pattern, two chords per bar
//   inv   each chord through its inversions and back, quarter-note block chords
import { html, render } from '../html.js';
import { chord as mkChord, KEYS_FOURTHS, QUALITIES, midiName, noteLabel } from '../theory.js';
import { audio, swingGroove } from '../audio.js';
import { Take, matchNotes, mean } from '../lib/tempo.js';
import { analyzeSwing } from '../lib/swing.js';

export const TECH = {
  arp: { title: 'Seventh-chord arpeggios', perSet: 4,
    how: 'Right hand: up and down each chord, root–3rd–5th–7th–octave–7th–5th–3rd, in swung eighths, one bar per chord. Left hand: hold the root an octave lower for the whole bar. Keep the line even and legato, with a little weight on each offbeat. Fingering: 1-2-3-4-5 when the octave fits under your hand; otherwise 1-2-3-5 and slide the 5th finger to the octave. Pick one fingering per chord and keep it.' },
  p1235: { title: '1-2-3-5 patterns', perSet: 8,
    how: 'For each chord play the 1st, 2nd, 3rd and 5th notes of its scale (C D E G for C major and C7, C D E♭ G for Cm7) as swung eighths. Two chords per bar, left hand on each root. This four-note shape is one of the most common building blocks in jazz lines. Fingering 1-2-3-5.' },
  inv: { title: 'Inversions', perSet: 2,
    how: 'Play each chord as a block in root position, then 1st, 2nd and 3rd inversion going up, then back down, one chord per beat. Right hand only. Move the bottom note to the top each time, so the hand climbs smoothly. Listen for all four notes sounding together.' },
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
    [0, 1, 2, 3, 2, 1, 0].forEach((k, b) => inv(k).forEach(m => add(8 * i + b, m, 'R')));
    labels.push({ beat: 8 * i, text: c.symbol });
  });
  return { notes, beats: 8 * chords.length, labels, swing: false, split: 0 };
}

export function judgeTech(ex, played, bpm) {
  const m = matchNotes(ex.notes, played, ex.swing ? 0.25 : 0.3);
  const beatMs = 60000 / bpm;
  const accuracy = m.pairs.length / ex.notes.length;
  const timing = mean(m.pairs.map(x => Math.abs(x.d) * beatMs));
  const v = [{ ok: accuracy >= 0.9, text: `Notes: ${m.pairs.length} of ${ex.notes.length} right${m.extra.length ? `, ${m.extra.length} extra` : ''}.` }];
  if (timing != null) v.push({ ok: timing <= 50, text: `Timing: ${Math.round(timing)} ms off the grid on average.` });
  let placement = null, accent = null;
  if (ex.swing) {
    const rh = m.pairs.filter(x => x.e.hand === 'R');
    const off = rh.filter(x => x.e.off), on = rh.filter(x => !x.e.off);
    placement = mean(off.map(x => x.p.beat - Math.floor(x.e.beat)));
    accent = off.length && on.length ? mean(off.map(x => x.p.vel)) / Math.max(1, mean(on.map(x => x.p.vel))) : null;
    if (placement != null) {
      const pct = Math.round(placement * 100);
      v.push({ ok: placement >= 0.58 && placement <= 0.76, text: placement < 0.58 ? `Offbeats at ${pct}% of the beat: too straight, aim for 67%.` : placement > 0.76 ? `Offbeats at ${pct}% of the beat: too late, aim for 67%.` : `Offbeats at ${pct}% of the beat: swinging.` });
    }
    if (accent != null) v.push({ ok: accent >= 1.04, soft: true, text: accent >= 1.04 ? `Offbeats ${Math.round((accent - 1) * 100)}% louder: doo-VAH.` : 'Offbeats not accented yet: lighten the notes on the beat.' });
    const sec = 60 / bpm;
    const leg = analyzeSwing(played.filter(p => p.hand === 'R').map(p => ({ t: p.beat * sec, off: p.offBeat == null ? null : p.offBeat * sec, vel: p.vel, midi: p.midi })), 0, sec).legato;
    if (leg != null) v.push({ ok: leg >= 0.8, soft: true, text: `Legato: ${Math.round(leg * 100)}% of notes connected.` });
  }
  const clean = accuracy >= 0.9 && (!ex.swing || (placement != null && placement >= 0.58 && placement <= 0.76));
  return { accuracy, timing, placement, accent, verdicts: v, clean, match: m };
}

export const technique = {
  title: 'Technique',
  mount(ctx) {
    const { el, cfg, store, kb } = ctx;
    const kind = cfg.ex || 'arp', qualities = cfg.qualities || ['maj7'];
    const statKey = `${kind}:${qualities.join(',')}`;
    const stats = () => (((store.progress.keys.tech ||= {})[statKey]) ||= {});
    const nSets = setCount(kind, qualities);
    let set = cfg.set != null ? cfg.set : Math.max(0, Array.from({ length: nSets }, (_, k) => k).find(k => !stats()[k]?.clean) ?? 0);
    let bpm = cfg.tempo || 80, take = null, played = [], open = new Map(), result = null, lastBeat = -1, guide = store.settings.techGuide !== false;
    let ex = techExercise(kind, qualities, set), takes = 0;

    function events() {
      const b = 60 / bpm;
      return ex.swing ? swingGroove(ex.beats, bpm, { kick: false }) : Array.from({ length: ex.beats }, (_, i) => ({ t: i * b, kind: 'tick', level: i % 4 === 0 ? 1 : 0 }));
    }
    async function start() {
      if (take && take.running) return take.stop(false);
      result = null; played = []; open.clear(); lastBeat = -1;
      take = new Take({ bpm, beats: ex.beats, events: events(), onBeat, onEnd: finish });
      await take.start();
      draw();
    }
    async function demo() {
      if (take && take.running) return;
      await audio.init();
      const b = 60 / bpm;
      const ev = ex.notes.map(n => ({ t: n.beat * b, kind: 'note', midi: n.midi, dur: n.hand === 'L' ? b * 3.8 : ex.swing ? b * (n.off ? 0.33 : 0.66) : b * 0.9, vel: n.hand === 'L' ? 0.3 : n.off ? 0.5 : 0.38 }));
      result = null; played = [];
      take = new Take({ bpm, beats: ex.beats, events: [...ev, ...events()], onBeat, onEnd: () => { take = null; kb.setTargets([]); draw(); } });
      take.demo = true;
      await take.start();
      draw();
    }
    function onBeat(b) {
      const ph = el.querySelector('.lane-head');
      if (ph) ph.setAttribute('x', String(30 + Math.max(0, Math.min(ex.beats, b)) * (640 / ex.beats)));
      const idx = Math.floor(b + 0.1);
      if (idx !== lastBeat) {
        lastBeat = idx;
        const c = el.querySelector('.count'); if (c) c.textContent = b < 0 ? `count-in ${4 + idx + 1}` : idx < ex.beats ? `bar ${Math.floor(idx / 4) + 1} · beat ${(idx % 4) + 1}` : '';
        if (guide || (take && take.demo)) kb.setTargets(ex.notes.filter(n => Math.floor(n.beat + 1e-6) === Math.max(0, idx)).map(n => ({ midi: n.midi, hand: n.hand })));
      }
    }
    function finish(completed) {
      kb.setTargets([]);
      for (const p of open.values()) p.offBeat = take.beatNow();
      open.clear();
      if (!completed && played.length < ex.notes.length * 0.4) { take = null; draw(); return; }
      result = judgeTech(ex, played, bpm);
      const st = (stats()[set] ||= { tries: 0, clean: false, best: null });
      st.tries++;
      if (result.clean) st.clean = true;
      if (!st.best || result.accuracy > st.best.accuracy || (result.clean && bpm > st.best.bpm)) st.best = { accuracy: +result.accuracy.toFixed(3), bpm, clean: result.clean };
      store.save();
      store.log({ drill: 'technique', ex: kind, qualities, set, bpm, accuracy: result.accuracy, clean: result.clean });
      takes++;
      if (takes >= (cfg.takes || 3) || Object.values(stats()).filter(x => x.tries).length >= Math.min(nSets, cfg.sets || 2)) ctx.done({ takes });
      take = null;
      draw();
    }
    function lane() {
      const lo = Math.min(...ex.notes.map(n => n.midi)) - 1, hi = Math.max(...ex.notes.map(n => n.midi)) + 1, H = 160;
      const X = b => 30 + b * (640 / ex.beats), Y = m => 14 + (hi - m) / (hi - lo) * (H - 24);
      const hit = result ? result.match.hit : null;
      return html`<svg class="lane" viewBox="0 0 690 ${H}">
        ${Array.from({ length: ex.beats / 4 + 1 }, (_, k) => html`<line x1="${X(4 * k) - 6}" x2="${X(4 * k) - 6}" y1="4" y2="${H - 4}" class="barline"></line>`)}
        ${Array.from({ length: ex.beats }, (_, b) => html`<line x1="${X(b)}" x2="${X(b)}" y1="12" y2="${H - 4}" class="beatline"></line>`)}
        ${ex.labels.map(l => html`<text x="${X(l.beat)}" y="10" class="lane-label">${l.text}</text>`)}
        ${ex.notes.map((n, k) => html`<circle cx="${X(n.beat)}" cy="${Y(n.midi)}" r="${n.hand === 'L' ? 3.5 : 4}" class="${!hit ? `n-${n.hand}` : hit.has(k) ? 'n-ok' : 'n-miss'}"><title>${midiName(n.midi)}</title></circle>`)}
        ${played.map(p => html`<line x1="${X(p.beat)}" x2="${X(p.beat)}" y1="${Y(p.midi) - 7}" y2="${Y(p.midi) + 7}" class="pl"></line>`)}
        <rect class="lane-head" x="30" y="2" width="2" height="${H - 4}"></rect>
      </svg>`;
    }
    function draw() {
      const running = take && take.running;
      const st = stats()[set];
      render(el, html`
        <div class="card drill-card coord technique">
          <p class="how"><b>${TECH[kind].title}.</b> ${TECH[kind].how}</p>
          <div class="chips">${Array.from({ length: nSets }, (_, k) => html`<button class="chip ${k === set ? 'on' : ''} ${stats()[k]?.clean ? 'pass' : stats()[k]?.tries ? 'tried' : ''}" data-set="${k}" ${running ? 'disabled' : ''}>${setLabel(kind, qualities, k)}${stats()[k]?.clean ? ' ✓' : ''}</button>`)}</div>
          ${lane()}
          <div class="row coord-controls">
            <button class="btn primary" data-a="go">${running && !take.demo ? 'Stop' : 'Start'} <kbd>Space</kbd></button>
            <button class="btn" data-a="demo" ${running ? 'disabled' : ''}>Listen</button>
            <span class="tempo"><button class="btn ghost" data-t="-5" ${running ? 'disabled' : ''}>−</button><b>♩ = ${bpm}</b><button class="btn ghost" data-t="5" ${running ? 'disabled' : ''}>+</button></span>
            <label class="check"><input type="checkbox" data-a="guide" ${guide ? 'checked' : ''}> Show notes</label>
            <span class="count muted"></span>
          </div>
          ${result ? html`<div class="verdicts ${result.clean ? 'pass' : ''}">
              <div class="verdict-title">${result.clean ? `✓ Clean at ♩ = ${bpm}${bpm < 120 ? '. Try it 5 faster.' : ''}` : 'Not yet'}</div>
              ${result.verdicts.map(v => html`<div class="${v.ok ? 'ok' : v.soft ? 'warn' : 'bad'}">${v.ok ? '✓' : '✗'} ${v.text}</div>`)}
            </div>` : html`<p class="muted small">${cfg.note || 'Press Listen to hear it first, then Start: one bar of count-in, then play along. Aim for 90% of the notes right before speeding up.'}</p>`}
          ${st?.best ? html`<p class="muted small">Best here: ${Math.round(st.best.accuracy * 100)}% at ♩ = ${st.best.bpm} · ${st.tries} tries</p>` : ''}
        </div>`);
      el.querySelector('[data-a=go]').onclick = () => (take && take.demo ? null : start());
      el.querySelector('[data-a=demo]').onclick = demo;
      el.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => { bpm = Math.max(40, Math.min(200, bpm + +b.dataset.t)); draw(); }; });
      el.querySelectorAll('[data-set]').forEach(b => { b.onclick = () => { set = +b.dataset.set; ex = techExercise(kind, qualities, set); result = null; played = []; draw(); }; });
      el.querySelector('[data-a=guide]').onchange = e => { guide = e.target.checked; store.settings.techGuide = guide; store.save(); if (!guide) kb.setTargets([]); };
    }
    draw();
    return {
      noteOn(m, vel, t) {
        if (!take || !take.running || take.demo) return;
        const p = { midi: m, vel, beat: take.beatAt(t), hand: m < ex.split ? 'L' : 'R' };
        if (p.beat < -0.5) return;
        played.push(p); open.set(m, p);
        kb.press(m, ex.notes.some(n => n.midi === m && Math.abs(n.beat - p.beat) < 0.3) ? 'ok' : 'bad');
      },
      noteOff(m, t) { const p = open.get(m); if (p && take) { p.offBeat = take.beatAt(t); open.delete(m); } },
      onSpace() { start(); },
      get take() { return take; }, // for debugging
      destroy() { if (take) { take.onEnd = null; take.stop(); } kb.setTargets([]); },
    };
  },
};
