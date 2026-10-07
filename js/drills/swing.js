// Swing check: play one of the swing exercises (twice through) or anything you like over a ride cymbal.
// The app checks the notes, then shows where your offbeats land, how they're accented, and how legato you are.
import { html, render } from '../html.js';
import { swingGroove } from '../audio.js';
import { Take, matchNotes } from '../lib/tempo.js';
import { analyzeSwing, swingVerdicts, swingPasses, phaseOf } from '../lib/swing.js';
import { parseAbc, swingNotes, drawAbc } from '../lib/abc.js';
import { SWING_EXERCISES } from '../content/index.js';
import { playAbc, stopPlayback } from './lesson.js';
import { ladder, UP_AFTER, STEP } from '../lib/ladder.js';

const demoed = new Set();

const FREE_BARS = 8;
const LETTERS = Object.keys(SWING_EXERCISES);

export const swing = {
  title: 'Swing check',
  mount(ctx) {
    const { el, cfg, store, kb } = ctx;
    const P = store.progress;
    const list = Array.isArray(cfg.exercises) ? cfg.exercises : LETTERS;
    const choices = [...list, 'free'];
    const exStat = () => ((P.keys.swingEx ||= {}));
    let ex = list.find(l => !exStat()[l]?.passed) || list[0];
    let take = null, notes = [], open = new Map(), result = null, cleanToday = 0, goalMet = false, levelMsg = '', demoing = false;
    const goal = cfg.goal || (Array.isArray(cfg.exercises) ? list.length * 2 : 2);
    const lad = () => ladder(store, `swing:${ex}`, { start: cfg.tempo || 100, min: 60 });
    let bpm = lad().bpm;
    const split = 60; // notes from middle C up are the line; below is your left hand keeping time

    function expected() {
      if (ex === 'free') return null;
      const one = swingNotes(parseAbc(SWING_EXERCISES[ex].abc).notes);
      return [...one, ...one.map(n => ({ ...n, beat: n.beat + 16 }))];
    }
    const beats = () => (ex === 'free' ? FREE_BARS * 4 : 32);

    async function start() {
      if (take && take.running) return take.stop(false);
      stopPlayback(); demoing = false;
      notes = []; open.clear(); result = null; levelMsg = '';
      take = new Take({ bpm, beats: beats(), events: swingGroove(beats(), bpm, { kick: true }), onBeat, onEnd: finish });
      await take.start();
      draw();
    }
    function onBeat(b) {
      const c = el.querySelector('.count');
      if (c) c.textContent = b < 0 ? `count-in ${Math.floor(b) + 5}` : `bar ${Math.min(beats() / 4, Math.floor(b / 4) + 1)} of ${beats() / 4}`;
    }
    function finish() {
      for (const p of open.values()) p.off = take.secAt(performance.now());
      open.clear();
      const analysis = analyzeSwing(notes, 0, take.beatSec);
      const exp = expected();
      let accuracy = null, extra = 0;
      if (exp) {
        const m = matchNotes(exp, notes.map(n => ({ ...n, beat: n.t / take.beatSec })), 0.25);
        accuracy = m.pairs.length / exp.length; extra = m.extra.length;
      }
      const passed = swingPasses(analysis) && (accuracy == null || accuracy >= 0.9);
      result = { analysis, accuracy, extra, passed, tempo: bpm };
      if (analysis.pairs >= 4) {
        const S = (P.swing ||= []);
        S.push({ at: Date.now(), ex, bpm, placement: analysis.placement, accent: analysis.accent, legato: analysis.legato, pairs: analysis.pairs, accuracy, passed });
        if (S.length > 60) S.shift();
        if (ex !== 'free') {
          const st = (exStat()[ex] ||= { passed: false, tries: 0 });
          st.tries++; if (passed) { st.passed = true; st.bpm = Math.max(st.bpm || 0, bpm); }
        }
        store.save();
        store.log({ drill: 'swing', ex, bpm, placement: analysis.placement, louder: analysis.louder, pairs: analysis.pairs, accuracy, passed });
        if (ex !== 'free') {
          const lv = lad().record(passed);
          levelMsg = lv.up ? `Level up: ♩ ${bpm} → ${lv.bpm}` : lv.down ? `Back to ♩ ${lv.bpm} for a while` : '';
        }
        if (passed) {
          cleanToday++;
          if (!goalMet && cleanToday >= goal) { goalMet = true; ctx.done({ passed }); }
          // next exercise in the step that still needs work
          const i = list.indexOf(ex);
          const next = list.slice(i + 1).concat(list.slice(0, i + 1)).find(l => !exStat()[l]?.passed);
          if (next && next !== ex) { result.next = next; ex = next; bpm = lad().bpm; }
          else bpm = ex === 'free' ? bpm : lad().bpm;
        } else if (ex !== 'free') bpm = lad().bpm;
      }
      take = null;
      draw();
    }
    function ruler() {
      // where each offbeat landed within the beat: 0 = on the beat, 50% = straight, 67% = triplet swing
      const offs = [];
      for (let i = 1; i < notes.length; i++) {
        const a = phaseOf(notes[i - 1].t, 0, 60 / bpm), b = phaseOf(notes[i].t, 0, 60 / bpm);
        if (Math.abs(a.phase) <= 0.14 && b.beat === a.beat && b.phase >= 0.38 && b.phase <= 0.88) offs.push(b.phase);
      }
      const x = f => 34 + f * 532;
      return html`<svg class="ruler" viewBox="0 0 600 70">
        <rect x="${x(0.58)}" y="14" width="${x(0.76) - x(0.58)}" height="30" class="zone-ok"></rect>
        <line x1="${x(0)}" x2="${x(1)}" y1="44" y2="44" class="axis"></line>
        ${[[0, 'beat'], [0.5, 'straight ½'], [2 / 3, 'swing ⅔'], [1, 'next beat']].map(([f, l]) => html`<line x1="${x(f)}" x2="${x(f)}" y1="40" y2="48" class="axis"></line><text x="${x(f)}" y="62">${l}</text>`)}
        ${offs.map(f => html`<line x1="${x(f)}" x2="${x(f)}" y1="18" y2="42" class="hitmark"></line>`)}
      </svg>`;
    }
    function demo() {
      if (take && take.running) return;
      const E = SWING_EXERCISES[ex]; if (!E) return;
      demoed.add(ex); demoing = true; draw();
      playAbc({ abc: E.abc, bpm, ride: true }, { swing: true, accent: true, kb, onEnd: () => { demoing = false; draw(); } });
    }
    function draw() {
      const running = take && take.running;
      const E = SWING_EXERCISES[ex];
      const hist = (P.swing || []).slice(-5).reverse();
      const a = result && result.analysis;
      const left = UP_AFTER - (E ? lad().streak : 0);
      render(el, html`
        <div class="card drill-card swingcheck">
          <div class="pat-top">
            <div class="chips">${choices.map(l => html`<button class="chip ${l === ex ? 'on' : ''} ${exStat()[l]?.passed ? 'pass' : exStat()[l]?.tries ? 'tried' : ''}" data-ex="${l}" ${running ? 'disabled' : ''}>${l === 'free' ? 'Free play' : `Exercise ${l}${exStat()[l]?.passed ? ' ✓' : ''}`}</button>`)}</div>
            <div class="goal" title="Clean takes today">${Array.from({ length: goal }, (_, k) => html`<i class="${k < cleanToday ? 'on' : ''}"></i>`)}<span>${goalMet ? '✓ today’s goal' : `${cleanToday} of ${goal} clean`}</span></div>
          </div>
          ${E ? html`<p class="pat-short"><b>${ex}. ${E.title}.</b> ${E.focus}</p>
            <div class="abc-host swing-abc"></div>`
          : html`<p class="pat-short">Play any eighth-note line in your right hand for ${FREE_BARS} bars: a scale, an idea from the drone, a phrase from a record.</p>`}
          ${ruler()}
          <div class="row">
            ${running ? html`<button class="btn" data-a="go">Stop</button>` : html`<b class="g-turn">${demoing ? 'Watch…' : 'Play any key to start'}</b>`}
            ${E ? html`<button class="btn ghost small" data-a="listen" ${running || demoing ? 'disabled' : ''}>↻ Show me again</button>` : ''}
            <span class="tempo" title="Your level for this exercise. It goes up by itself after ${UP_AFTER} clean takes in a row."><button class="btn ghost" data-t="-${STEP}" ${running ? 'disabled' : ''}>−</button><b>♩ = ${bpm}</b><button class="btn ghost" data-t="${STEP}" ${running ? 'disabled' : ''}>+</button></span>
            <span class="count muted">${demoing ? 'Watch and listen…' : ''}</span>
          </div>
          ${E ? html`<p class="level muted small">${levelMsg ? html`<b class="ok">${levelMsg}</b> · ` : ''}${left > 0 && left < UP_AFTER ? `${left} more clean take${left > 1 ? 's' : ''} in a row to go up to ♩ ${bpm + STEP}.` : `${UP_AFTER} clean takes in a row move you up a level (♩ +${STEP}).`}</p>` : ''}
          ${result ? html`<div class="verdicts ${result.passed ? 'pass' : ''}">
              <div class="verdict-title">${result.passed ? `✓ That swings at ♩ = ${result.tempo}` : a.pairs ? 'Not yet: same again' : 'Nothing to measure'}${result.next ? html` <span class="muted small">· next up: Exercise ${result.next}</span>` : ''}</div>
              ${result.accuracy != null ? html`<div class="${result.accuracy >= 0.9 ? 'ok' : 'bad'}">${result.accuracy >= 0.9 ? '✓' : '✗'} Notes: ${Math.round(result.accuracy * 100)}% right${result.extra ? `, ${result.extra} extra` : ''}.</div>` : ''}
              ${swingVerdicts(a).map(v => html`<div class="${v.ok ? 'ok' : v.soft ? 'warn' : 'bad'}">${v.ok ? '✓' : '✗'} ${v.text}</div>`)}
            </div>` : ''}
          <details class="how-more"><summary>How to do it</summary><p>Play the line twice through with your right hand over the ride cymbal, after a one-bar count-in. Your left hand can keep quarter notes below middle C. Swung eighths: each offbeat lands on the last third of the beat, and is a little louder than the note before it (doo-VAH). It counts as clean when at least 3 in 4 offbeats land in the swing zone and 3 in 4 are louder than their beat.</p></details>
          ${hist.length ? html`<p class="muted small">Recent: ${hist.map((h, k) => html`${k ? ' · ' : ''}${h.passed ? '✓' : '✗'} ${h.ex && h.ex !== 'free' ? `${h.ex} ` : ''}${Math.round(h.placement * 100)}% at ♩ ${h.bpm}`)}</p>` : ''}
        </div>`);
      const host = el.querySelector('.swing-abc'); if (host && E) drawAbc(host, E.abc);
      const go = el.querySelector('[data-a=go]'); if (go) go.onclick = start;
      const li = el.querySelector('[data-a=listen]'); if (li) li.onclick = demo;
      el.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => { bpm = Math.max(60, Math.min(220, bpm + +b.dataset.t)); if (ex !== 'free') lad().set(bpm); levelMsg = ''; draw(); }; });
      el.querySelectorAll('[data-ex]').forEach(b => { b.onclick = () => { ex = b.dataset.ex; result = null; notes = []; levelMsg = ''; if (ex !== 'free') bpm = lad().bpm; draw(); if (!demoed.has(ex) && SWING_EXERCISES[ex]) setTimeout(demo, 300); }; });
    }
    draw();
    if (SWING_EXERCISES[ex] && !demoed.has(ex)) setTimeout(() => { if (!take) demo(); }, 600);
    return {
      noteOn(m, vel, t) {
        if (!take && !demoing) { start(); return; } // play any key to start (that key only starts it)
        if (!take || !take.running || m < split) return;
        const n = { midi: m, vel, t: take.secAt(t), off: null };
        if (n.t < -0.3) return;
        notes.push(n); open.set(m, n);
        const ph = phaseOf(n.t, 0, take.beatSec);
        if (ph.phase >= 0.38 && ph.phase <= 0.88) {
          const svg = el.querySelector('.ruler');
          if (svg) { const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); const x = 34 + ph.phase * 532; Object.entries({ x1: x, x2: x, y1: 18, y2: 42, class: 'hitmark live' }).forEach(([k, v]) => l.setAttribute(k, v)); svg.appendChild(l); }
        }
        const exp = expected();
        const beat = n.t / take.beatSec;
        kb.press(m, !exp ? 'neutral' : exp.some(e => e.midi === m && Math.abs(e.beat - beat) < 0.25) ? 'ok' : 'bad');
      },
      noteOff(m, t) { const n = open.get(m); if (n && take) { n.off = take.secAt(t); open.delete(m); } },
      onSpace() { start(); },
      get take() { return take; }, // for debugging
      busy: () => !!(take && take.running) || demoing,
      destroy() { stopPlayback(); if (take) { take.onEnd = null; take.stop(); } },
    };
  },
};
