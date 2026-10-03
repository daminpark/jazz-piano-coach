// Swing check: play one of the swing exercises (twice through) or anything you like over a ride cymbal.
// The app checks the notes, then shows where your offbeats land, how they're accented, and how legato you are.
import { html, render } from '../html.js';
import { swingGroove } from '../audio.js';
import { Take, matchNotes } from '../lib/tempo.js';
import { analyzeSwing, swingVerdicts, swingPasses, phaseOf } from '../lib/swing.js';
import { parseAbc, swingNotes, drawAbc } from '../lib/abc.js';
import { SWING_EXERCISES } from '../content/index.js';
import { playAbc, stopPlayback } from './lesson.js';

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
    let bpm = cfg.tempo || 100, take = null, notes = [], open = new Map(), result = null;
    const tried = new Set();
    const split = 60; // notes from middle C up are the line; below is your left hand keeping time

    function expected() {
      if (ex === 'free') return null;
      const one = swingNotes(parseAbc(SWING_EXERCISES[ex].abc).notes);
      return [...one, ...one.map(n => ({ ...n, beat: n.beat + 16 }))];
    }
    const beats = () => (ex === 'free' ? FREE_BARS * 4 : 32);

    async function start() {
      if (take && take.running) return take.stop(false);
      stopPlayback();
      notes = []; open.clear(); result = null;
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
      result = { analysis, accuracy, extra, passed };
      if (analysis.pairs >= 4) {
        const S = (P.swing ||= []);
        S.push({ at: Date.now(), ex, bpm, placement: analysis.placement, accent: analysis.accent, legato: analysis.legato, pairs: analysis.pairs, accuracy, passed });
        if (S.length > 60) S.shift();
        if (ex !== 'free') {
          const st = (exStat()[ex] ||= { passed: false, tries: 0 });
          st.tries++; if (passed) { st.passed = true; st.bpm = Math.max(st.bpm || 0, bpm); }
        }
        store.save();
        store.log({ drill: 'swing', ex, bpm, placement: analysis.placement, accent: analysis.accent, accuracy, passed });
        tried.add(ex);
        if (list.every(l => tried.has(l)) || (!Array.isArray(cfg.exercises) && passed)) ctx.done({ passed });
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
    function draw() {
      const running = take && take.running;
      const E = SWING_EXERCISES[ex];
      const hist = (P.swing || []).slice(-5).reverse();
      const a = result && result.analysis;
      render(el, html`
        <div class="card drill-card swingcheck">
          <div class="chips">${choices.map(l => html`<button class="chip ${l === ex ? 'on' : ''} ${exStat()[l]?.passed ? 'pass' : exStat()[l]?.tries ? 'tried' : ''}" data-ex="${l}" ${running ? 'disabled' : ''}>${l === 'free' ? 'Free play' : `Exercise ${l}${exStat()[l]?.passed ? ' ✓' : ''}`}</button>`)}</div>
          ${E ? html`<p><b>${ex}. ${E.title}.</b> ${E.focus} Play it twice through with the right hand. Your left hand can keep quarter notes below middle C.</p>
            <div class="abc-host swing-abc"></div>`
          : html`<p>Play any eighth-note line in your right hand for ${FREE_BARS} bars: a scale, an idea from the drone, a phrase from a record. Say “doo-VAH” in your head.</p>`}
          ${ruler()}
          <div class="row">
            <button class="btn primary" data-a="go">${running ? 'Stop' : 'Start'} <kbd>Space</kbd></button>
            ${E ? html`<button class="btn" data-a="listen" ${running ? 'disabled' : ''}>Listen</button>` : ''}
            <span class="tempo"><button class="btn ghost" data-t="-5" ${running ? 'disabled' : ''}>−</button><b>♩ = ${bpm}</b><button class="btn ghost" data-t="5" ${running ? 'disabled' : ''}>+</button></span>
            <span class="count muted"></span>
          </div>
          ${result ? html`<div class="verdicts ${result.passed ? 'pass' : ''}">
              <div class="verdict-title">${result.passed ? '✓ That swings' : a.pairs ? 'Not yet' : 'Nothing to measure'}${a.pairs ? html` <span class="muted small">(${a.pairs} eighth-note pairs measured)</span>` : ''}</div>
              ${result.accuracy != null ? html`<div class="${result.accuracy >= 0.9 ? 'ok' : 'bad'}">${result.accuracy >= 0.9 ? '✓' : '✗'} Notes: ${Math.round(result.accuracy * 100)}% right${result.extra ? `, ${result.extra} extra` : ''}.</div>` : ''}
              ${swingVerdicts(a).map(v => html`<div class="${v.ok ? 'ok' : 'bad'}">${v.ok ? '✓' : '✗'} ${v.text}</div>`)}
            </div>` : ''}
          ${hist.length ? html`<p class="muted small">Recent: ${hist.map((h, k) => html`${k ? ' · ' : ''}${h.passed ? '✓' : '✗'} ${h.ex && h.ex !== 'free' ? `${h.ex} ` : ''}${Math.round(h.placement * 100)}% at ♩ ${h.bpm}`)}</p>` : ''}
        </div>`);
      const host = el.querySelector('.swing-abc'); if (host && E) drawAbc(host, E.abc);
      el.querySelector('[data-a=go]').onclick = start;
      const li = el.querySelector('[data-a=listen]'); if (li) li.onclick = () => playAbc({ abc: E.abc, bpm, ride: true }, { swing: true, accent: true });
      el.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => { bpm = Math.max(60, Math.min(220, bpm + +b.dataset.t)); draw(); }; });
      el.querySelectorAll('[data-ex]').forEach(b => { b.onclick = () => { ex = b.dataset.ex; result = null; notes = []; draw(); }; });
    }
    draw();
    return {
      noteOn(m, vel, t) {
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
      destroy() { stopPlayback(); if (take) { take.onEnd = null; take.stop(); } },
    };
  },
};
