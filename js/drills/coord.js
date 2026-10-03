// Coordination Exercise 1 in any key: a two-octave major scale over left-hand quarter notes.
// Part 1 repeats every other note as triplets; part 2 drops the repeated note, which leaves swung eighths.
// A take is checked note by note, then for swing placement, offbeat accent and legato.
import { html, render } from '../html.js';
import { KEYS_FOURTHS, majorScale, noteLabel, parseNote, pcOf, midiName } from '../theory.js';
import { audio, swingGroove } from '../audio.js';
import { Take, matchNotes, mean } from '../lib/tempo.js';
import { analyzeSwing } from '../lib/swing.js';
import { coordPassed } from '../curriculum.js';

const SEMIS = [0, 2, 4, 5, 7, 9, 11];
export const GATE_BPM = 100;

/** the exercise as expected notes {beat, midi, hand, partial} over 16 beats (4 bars) */
export function coordExercise(key, part) {
  const pc = pcOf(parseNote(key));
  const tonic = 55 + ((pc - 7 + 12) % 12); // between G3 and F♯4
  const s = Array.from({ length: 15 }, (_, d) => tonic + SEMIS[d % 7] + 12 * Math.floor(d / 7));
  const notes = [];
  const rh = (beat, midi, partial) => notes.push({ beat: beat + partial, midi, hand: 'R', partial, beatIdx: beat });
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
  return { notes: notes.sort((a, b) => a.beat - b.beat), tonic, scale: s, beats: 16 };
}

/** judge a take: accuracy, timing, swing placement, accent, legato */
export function judgeCoord(ex, played, bpm, part) {
  const m = matchNotes(ex.notes, played, part === 1 ? 0.16 : 0.25);
  const beatMs = 60000 / bpm;
  const accuracy = m.pairs.length / ex.notes.length;
  const timing = mean(m.pairs.map(x => Math.abs(x.d) * beatMs));
  const lhTiming = mean(m.pairs.filter(x => x.e.hand === 'L').map(x => Math.abs(x.d) * beatMs));
  const rhPairs = m.pairs.filter(x => x.e.hand === 'R');
  const off = rhPairs.filter(x => Math.abs(x.e.partial - 2 / 3) < 0.01);
  const on = rhPairs.filter(x => x.e.partial === 0 && x.e.beatIdx !== 7 && x.e.beatIdx !== 15);
  const placement = mean(off.map(x => x.p.beat - x.e.beatIdx));
  const accent = off.length && on.length ? mean(off.map(x => x.p.vel)) / Math.max(1, mean(on.map(x => x.p.vel))) : null;
  const sec = 60 / bpm, rhPlayed = played.filter(p => p.hand === 'R');
  const legato = part === 2 ? analyzeSwing(rhPlayed.map(p => ({ t: p.beat * sec, off: p.offBeat == null ? null : p.offBeat * sec, vel: p.vel, midi: p.midi })), 0, sec).legato : null;
  const v = [];
  v.push({ ok: accuracy >= 0.95, text: `Notes: ${m.pairs.length} of ${ex.notes.length} right${m.extra.length ? `, ${m.extra.length} extra` : ''}.` });
  if (timing != null) v.push({ ok: timing <= 45, text: `Timing: ${Math.round(timing)} ms off the grid on average${lhTiming != null ? ` (left hand ${Math.round(lhTiming)} ms)` : ''}.` });
  if (placement != null) {
    const pct = Math.round(placement * 100);
    v.push({ ok: placement >= 0.58 && placement <= 0.76, text: placement < 0.58 ? `The ${part === 1 ? 'third partial' : 'offbeat'} lands at ${pct}% of the beat: rushing toward straight eighths. Aim for 67%.`
      : placement > 0.76 ? `The ${part === 1 ? 'third partial' : 'offbeat'} lands at ${pct}% of the beat: too late. Aim for 67%.` : `The ${part === 1 ? 'third partial' : 'offbeat'} lands at ${pct}% of the beat: a true triplet swing.` });
  }
  if (accent != null) {
    const a = Math.round((accent - 1) * 100);
    v.push({ ok: accent >= 1.04, text: accent >= 1.04 ? `Third partial ${a}% louder than the beat: doo-VAH.` : `The third partial isn't accented (${a >= 0 ? '+' : ''}${a}%). Play the beat softer, lean on the offbeat.` });
  }
  if (legato != null) v.push({ ok: legato >= 0.8, soft: true, text: legato >= 0.8 ? `Legato: ${Math.round(legato * 100)}% connected.` : `Legato: ${Math.round(legato * 100)}% connected. Hold each note into the next.` });
  const clean = accuracy >= 0.95 && accent != null && accent >= 1.04 && (placement == null || (placement >= 0.58 && placement <= 0.76));
  const passed = clean && (part === 1 || bpm >= GATE_BPM);
  return { accuracy, timing, placement, accent, legato, verdicts: v, clean, passed, match: m };
}

export const coord = {
  title: 'Coordination Exercise 1',
  mount(ctx) {
    const { el, cfg, store, kb } = ctx;
    const P = store.progress;
    const part = cfg.part || 2;
    const keysCfg = cfg.keys === 'unpassed' ? KEYS_FOURTHS.filter(k => !coordPassed(P, k, part)) : (cfg.keys || KEYS_FOURTHS);
    const keys = keysCfg.length ? keysCfg : KEYS_FOURTHS;
    let key = keys[0], bpm = cfg.tempo || 90, take = null, played = [], open = new Map(), result = null, lastBeatIdx = -1, guide = store.settings.coordGuide !== false;
    let feel = store.settings.coordFeel || 'click24';
    const tried = new Set();
    let ex = coordExercise(key, part);

    const statOf = k => (P.keys.coord1 ||= {})[k]?.[`p${part}`];
    function save(r) {
      const K = ((P.keys.coord1 ||= {})[key] ||= {});
      const s = (K[`p${part}`] ||= { tries: 0, passed: false, best: null });
      s.tries++;
      const summary = { bpm, accuracy: +r.accuracy.toFixed(3), placement: r.placement && +r.placement.toFixed(3), accent: r.accent && +r.accent.toFixed(2), legato: r.legato && +r.legato.toFixed(2), at: Date.now() };
      if (r.passed) s.passed = true;
      if (!s.best || (r.clean && (!s.best.clean || bpm > s.best.bpm)) || (!s.best.clean && r.accuracy > s.best.accuracy)) s.best = { ...summary, clean: r.clean };
      s.last = summary;
      store.save();
      store.log({ drill: 'coord', key, part, ...summary, passed: r.passed });
      tried.add(key);
      if (keys.every(k => tried.has(k))) ctx.done({ keys: keys.length });
    }

    function accompaniment() {
      const ev = [];
      const b = 60 / bpm;
      if (feel === 'groove') ev.push(...swingGroove(16, bpm, { kick: false }));
      else for (let i = 0; i < 16; i++) if (feel === 'click' || i % 2 === 1) ev.push({ t: i * b, kind: 'tick', level: feel === 'click' && i % 4 === 0 ? 1 : 0 });
      return ev;
    }
    async function start() {
      if (take && take.running) return stop();
      result = null; played = []; open.clear(); lastBeatIdx = -1;
      take = new Take({ bpm, beats: 16, events: accompaniment(), onBeat, onEnd: finish });
      await take.start();
      draw();
    }
    function stop() { if (take) take.stop(false); }
    async function demo() {
      if (take && take.running) return;
      await audio.init();
      const b = 60 / bpm;
      const ev = ex.notes.map(n => ({ t: n.beat * b, kind: 'note', midi: n.midi, dur: n.hand === 'L' ? b * 0.9 : b * (part === 1 ? 0.36 : 0.66), vel: n.hand === 'L' ? 0.32 : Math.abs(n.partial - 2 / 3) < 0.01 ? 0.5 : 0.36 }));
      result = null; played = [];
      take = new Take({ bpm, beats: 16, events: [...ev, ...accompaniment()], onBeat, onEnd: () => { take = null; kb.setTargets([]); draw(); } });
      take.demo = true;
      await take.start();
      draw();
    }
    function onBeat(b) {
      const ph = el.querySelector('.lane-head');
      if (ph) ph.setAttribute('x', String(Math.max(0, Math.min(16, b)) * 40 + 30));
      const idx = Math.floor(b + 0.1);
      if (idx !== lastBeatIdx) {
        lastBeatIdx = idx;
        const cnt = el.querySelector('.count'); if (cnt) cnt.textContent = b < 0 ? `count-in ${4 + idx + 1}` : idx < 16 ? `bar ${Math.floor(idx / 4) + 1} · beat ${(idx % 4) + 1}` : '';
        if (guide || (take && take.demo)) kb.setTargets(ex.notes.filter(n => Math.floor(n.beat + 1e-6) === Math.max(0, idx)).map(n => ({ midi: n.midi, hand: n.hand })));
      }
    }
    function finish(completed) {
      kb.setTargets([]);
      if (take && take.demo) return;
      for (const [m, p] of open) { p.offBeat = take.beatNow(); open.delete(m); }
      const enough = played.length >= ex.notes.length * 0.5;
      if (!completed && !enough) { take = null; draw(); return; }
      result = judgeCoord(ex, played, bpm, part);
      save(result);
      take = null;
      draw();
    }

    function lane() {
      const lo = ex.tonic - 13, hi = ex.scale[14] + 1, H = 150, y = m => 10 + (hi - m) / (hi - lo) * (H - 20);
      const hit = result ? result.match.hit : null;
      const dots = ex.notes.map((n, k) => {
        const cls = !hit ? `n-${n.hand}` : hit.has(k) ? 'n-ok' : 'n-miss';
        return html`<circle cx="${30 + n.beat * 40}" cy="${y(n.midi)}" r="${n.hand === 'L' ? 4 : 5}" class="${cls}"><title>${midiName(n.midi)}</title></circle>`;
      });
      const plays = played.map(p => html`<line x1="${30 + p.beat * 40}" x2="${30 + p.beat * 40}" y1="${y(p.midi) - 8}" y2="${y(p.midi) + 8}" class="pl"></line>`);
      const bars = [0, 4, 8, 12, 16].map(b => html`<line x1="${30 + b * 40 - 10}" x2="${30 + b * 40 - 10}" y1="4" y2="${H - 4}" class="barline"></line>`);
      const beats = Array.from({ length: 16 }, (_, b) => html`<line x1="${30 + b * 40}" x2="${30 + b * 40}" y1="4" y2="${H - 4}" class="beatline"></line>`);
      return html`<svg class="lane" viewBox="0 0 680 ${H}">${bars}${beats}${dots}${plays}<rect class="lane-head" x="30" y="2" width="2" height="${H - 4}"></rect></svg>`;
    }
    function draw() {
      const running = take && take.running;
      const sc = majorScale(key).map(noteLabel).join(' ');
      render(el, html`
        <div class="card drill-card coord">
          <div class="coord-head">
            <div class="chips">${keys.map(k => { const s = statOf(k); return html`<button class="chip ${k === key ? 'on' : ''} ${s?.passed ? 'pass' : s?.tries ? 'tried' : ''}" data-key="${k}" ${running ? 'disabled' : ''}>${noteLabel(parseNote(k))}${s?.passed ? ' ✓' : ''}</button>`; })}</div>
            <div class="muted small">Part ${part}: ${part === 1 ? 'repeated-note triplets' : 'swung eighths'} · ${noteLabel(parseNote(key))} major: ${sc} · LH ${midiName(ex.tonic - 12)}</div>
          </div>
          ${lane()}
          <div class="row coord-controls">
            <button class="btn primary" data-a="go">${running && !take.demo ? 'Stop' : 'Start'} <kbd>Space</kbd></button>
            <button class="btn" data-a="demo" ${running ? 'disabled' : ''}>Listen</button>
            <span class="tempo"><button class="btn ghost" data-t="-5" ${running ? 'disabled' : ''}>−</button><b>♩ = ${bpm}</b><button class="btn ghost" data-t="5" ${running ? 'disabled' : ''}>+</button></span>
            <select data-a="feel" ${running ? 'disabled' : ''} aria-label="Accompaniment">
              <option value="click24" ${feel === 'click24' ? 'selected' : ''}>Click on 2 & 4</option>
              <option value="click" ${feel === 'click' ? 'selected' : ''}>Click every beat</option>
              <option value="groove" ${feel === 'groove' ? 'selected' : ''}>Ride cymbal</option>
            </select>
            <label class="check"><input type="checkbox" data-a="guide" ${guide ? 'checked' : ''}> Show notes</label>
            <span class="count muted"></span>
          </div>
          ${result ? html`<div class="verdicts ${result.passed ? 'pass' : ''}">
              <div class="verdict-title">${result.passed ? (part === 2 ? `✓ ${noteLabel(parseNote(key))} passed at ♩ = ${bpm}` : '✓ Clean') : result.clean ? `Clean at ♩ = ${bpm}. Take it to ${GATE_BPM} to pass.` : 'Not yet'}</div>
              ${result.verdicts.map(v => html`<div class="${v.ok ? 'ok' : v.soft ? 'warn' : 'bad'}">${v.ok ? '✓' : '✗'} ${v.text}</div>`)}
            </div>` : html`<p class="muted small">${cfg.note || ''} After a one-bar count-in, play the 4 bars once with both hands. Accent the third partial. Pass: 95% right notes, offbeats at about 67% of the beat, offbeats louder${part === 2 ? `, at ♩ = ${GATE_BPM} or faster` : ''}.</p>`}
          ${statOf(key)?.best ? html`<p class="muted small">Best in ${noteLabel(parseNote(key))}: ${Math.round(statOf(key).best.accuracy * 100)}% at ♩ = ${statOf(key).best.bpm}${statOf(key).best.placement ? ` · offbeats at ${Math.round(statOf(key).best.placement * 100)}%` : ''} · ${statOf(key).tries} tries</p>` : ''}
        </div>`);
      el.querySelector('[data-a=go]').onclick = () => (take && take.demo ? null : start());
      el.querySelector('[data-a=demo]').onclick = demo;
      el.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => { bpm = Math.max(50, Math.min(200, bpm + +b.dataset.t)); draw(); }; });
      el.querySelectorAll('[data-key]').forEach(b => { b.onclick = () => { key = b.dataset.key; ex = coordExercise(key, part); result = null; played = []; draw(); }; });
      el.querySelector('[data-a=feel]').onchange = e => { feel = e.target.value; store.settings.coordFeel = feel; store.save(); };
      el.querySelector('[data-a=guide]').onchange = e => { guide = e.target.checked; store.settings.coordGuide = guide; store.save(); if (!guide) kb.setTargets([]); };
    }
    draw();
    return {
      noteOn(m, vel, t) {
        if (!take || !take.running || take.demo) return;
        const p = { midi: m, vel, beat: take.beatAt(t), hand: m < ex.tonic - 2 ? 'L' : 'R' };
        if (p.beat < -0.5) return;
        played.push(p); open.set(m, p);
        const exp = ex.notes.find(n => n.midi === m && Math.abs(n.beat - p.beat) < 0.25);
        kb.press(m, exp ? 'ok' : 'bad');
      },
      noteOff(m, t) {
        const p = open.get(m);
        if (p && take) { p.offBeat = take.beatAt(t); open.delete(m); }
      },
      get take() { return take; }, // for debugging
      onSpace() { start(); },
      destroy() { if (take) { take.onEnd = null; take.stop(); } kb.setTargets([]); },
    };
  },
};
