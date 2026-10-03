// Swing check: play the book's Swing Exercises (p. 13) or any eighth-note line over a ride cymbal.
// The app listens to the right hand and shows where your offbeats land, how they're accented, and how legato you are.
import { html, render } from '../html.js';
import { swingGroove } from '../audio.js';
import { Take } from '../lib/tempo.js';
import { analyzeSwing, swingVerdicts, swingPasses, phaseOf } from '../lib/swing.js';

const BARS = 8;

export const swing = {
  title: 'Swing check',
  mount(ctx) {
    const { el, cfg, store, kb } = ctx;
    let bpm = cfg.tempo || 100, take = null, notes = [], open = new Map(), analysis = null, passed = false;
    const exercises = cfg.exercises && cfg.exercises !== 'any' ? cfg.exercises : 'A to E';
    const split = 60; // notes from middle C up are the line; below is your left hand keeping time

    async function start() {
      if (take && take.running) return take.stop(false);
      notes = []; open.clear(); analysis = null;
      take = new Take({ bpm, beats: BARS * 4, events: swingGroove(BARS * 4, bpm, { kick: true }), onBeat, onEnd: finish });
      await take.start();
      draw();
    }
    function onBeat(b) {
      const c = el.querySelector('.count');
      if (c) c.textContent = b < 0 ? `count-in ${Math.floor(b) + 5}` : `bar ${Math.min(BARS, Math.floor(b / 4) + 1)} of ${BARS}`;
    }
    function finish() {
      for (const p of open.values()) p.off = take.secAt(performance.now());
      open.clear();
      analysis = analyzeSwing(notes, 0, take.beatSec);
      passed = swingPasses(analysis);
      if (analysis.pairs >= 4) {
        const S = (store.progress.swing ||= []);
        S.push({ at: Date.now(), bpm, placement: analysis.placement, accent: analysis.accent, legato: analysis.legato, pairs: analysis.pairs, passed });
        if (S.length > 60) S.shift();
        store.save();
        store.log({ drill: 'swing', bpm, placement: analysis.placement, accent: analysis.accent, passed });
        if (passed || S.filter(s => s.at > Date.now() - 6 * 3600e3).length >= 3) ctx.done({ passed });
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
      const hist = (store.progress.swing || []).slice(-5).reverse();
      render(el, html`
        <div class="card drill-card swingcheck">
          <p>Play Swing Exercise${exercises.length > 1 ? 's' : ''} <b>${exercises}</b> (book p. 13), or any eighth-note line, over the ride cymbal.
            Keep time with quarter notes in the left hand if you like. Say “doo-VAH” in your head.</p>
          ${ruler()}
          <div class="row">
            <button class="btn primary" data-a="go">${running ? 'Stop' : `Start (${BARS} bars)`} <kbd>Space</kbd></button>
            <span class="tempo"><button class="btn ghost" data-t="-5" ${running ? 'disabled' : ''}>−</button><b>♩ = ${bpm}</b><button class="btn ghost" data-t="5" ${running ? 'disabled' : ''}>+</button></span>
            <span class="count muted"></span>
          </div>
          ${analysis ? html`<div class="verdicts ${passed ? 'pass' : ''}">
              <div class="verdict-title">${passed ? '✓ That swings' : analysis.pairs ? 'Not yet' : 'Nothing to measure'}${analysis.pairs ? html` <span class="muted small">(${analysis.pairs} eighth-note pairs measured)</span>` : ''}</div>
              ${swingVerdicts(analysis).map(v => html`<div class="${v.ok ? 'ok' : 'bad'}">${v.ok ? '✓' : '✗'} ${v.text}</div>`)}
            </div>` : ''}
          ${hist.length ? html`<p class="muted small">Recent: ${hist.map((h, k) => html`${k ? ' · ' : ''}${h.passed ? '✓' : '✗'} ${Math.round(h.placement * 100)}% at ♩ ${h.bpm}`)}</p>` : ''}
        </div>`);
      el.querySelector('[data-a=go]').onclick = start;
      el.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => { bpm = Math.max(60, Math.min(220, bpm + +b.dataset.t)); draw(); }; });
    }
    draw();
    return {
      noteOn(m, vel, t) {
        if (!take || !take.running || m < split) return;
        const n = { midi: m, vel, t: take.secAt(t), off: null };
        if (n.t < -0.3) return;
        notes.push(n); open.set(m, n);
        // live tick on the ruler
        const ph = phaseOf(n.t, 0, take.beatSec);
        if (ph.phase >= 0.38 && ph.phase <= 0.88) {
          const svg = el.querySelector('.ruler');
          if (svg) { const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); const x = 34 + ph.phase * 532; Object.entries({ x1: x, x2: x, y1: 18, y2: 42, class: 'hitmark live' }).forEach(([k, v]) => l.setAttribute(k, v)); svg.appendChild(l); }
        }
        kb.press(m, 'neutral');
      },
      noteOff(m, t) { const n = open.get(m); if (n && take) { n.off = take.secAt(t); open.delete(m); } },
      get take() { return take; }, // for debugging
      onSpace() { start(); },
      destroy() { if (take) { take.onEnd = null; take.stop(); } },
    };
  },
};
