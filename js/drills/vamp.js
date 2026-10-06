// Vamp: four random seventh chords loop over bass and drums; play each chord when it comes around.
// Each chord window counts as made if you're holding exactly that chord at some point in it (a little early is fine),
// and as smooth if your hand moved to the closest voicing from the chord before (within 2 semitones).
// The tempo goes up a level after a few clean runs in a row.
import { html, render } from '../html.js';
import { deck, matchesChord, movement, closestVoicing, heldNames } from '../theory.js';
import { audio, swingGroove } from '../audio.js';
import { Take } from '../lib/tempo.js';
import { ladder, UP_AFTER, STEP } from '../lib/ladder.js';

const demoed = new Set();

const CYCLES = 4;

function pickChords(qualities) {
  const pool = deck(qualities).sort(() => Math.random() - 0.5);
  const out = [];
  for (const c of pool) { if (out.length === 4) break; if (!out.some(o => o.pcs[0] === c.pcs[0])) out.push(c); }
  return out;
}
const bassMidi = pc => 28 + ((pc - 4 + 12) % 12); // E1..D♯2

export const vamp = {
  title: 'Vamp',
  mount(ctx) {
    const { el, cfg, store, kb } = ctx;
    let chords = pickChords(cfg.qualities || ['maj7', '7', 'm7']);
    let bpc = cfg.beatsPerChord || 8, take = null, hits = [], cur = -1, showTones = false, result = null, timer = 0, prevV = null, cleanToday = 0, goalMet = false, levelMsg = '', demoing = false;
    const goal = cfg.goal || 2;
    const lad = () => ladder(store, `vamp:${bpc}`, { start: cfg.tempo || 100, min: 50 });
    let bpm = lad().bpm;
    // the four chords in the voicings that move least from one to the next (looping back to the first)
    const smooth = () => { let v = closestVoicing([60, 64, 67, 71], chords[0]).voicing; const out = [v]; for (let k = 1; k < 4; k++) { v = closestVoicing(v, chords[k]).voicing; out.push(v); } return out; };
    const lead = 0.3; // beats: catching the chord slightly early still counts

    function events() {
      const b = 60 / bpm, beats = CYCLES * 4 * bpc, ev = swingGroove(beats, bpm, { kick: true });
      for (let w = 0; w < CYCLES * 4; w++) {
        const c = chords[w % 4], root = bassMidi(c.pcs[0]), fifth = root + 7 > 40 ? root - 5 : root + 7;
        for (let k = 0; k < bpc; k += 2) ev.push({ t: (w * bpc + k) * b, kind: 'bass', midi: k % 4 === 0 ? root : fifth, dur: b * 1.8, vel: 0.9 });
      }
      return ev;
    }
    async function start() {
      if (take && take.running) return take.stop(false);
      hits = Array(CYCLES * 4).fill(false); cur = -1; result = null; prevV = null; levelMsg = '';
      take = new Take({ bpm, beats: CYCLES * 4 * bpc, events: events(), onBeat, onEnd: finish });
      await take.start();
      draw();
      timer = setInterval(check, 30);
    }
    function windowAt(beat) { return Math.floor((beat + lead) / bpc); }
    function check() {
      if (!take || !take.running) return;
      const w = windowAt(take.beatNow());
      if (w < 0 || w >= hits.length || hits[w]) return;
      const held = [...ctx.held()];
      if (matchesChord(held, chords[w % 4])) {
        const v = held.sort((a, b) => a - b);
        const close = !prevV || movement(prevV, v) <= closestVoicing(prevV, chords[w % 4]).cost + 2;
        hits[w] = close ? 'smooth' : 'jumpy'; prevV = v;
        for (const m of v) kb.press(m, close ? 'ok' : 'neutral');
        const cell = el.querySelector(`[data-w="${w}"]`); if (cell) cell.classList.add(close ? 'hit' : 'jumpy');
      }
    }
    function onBeat(b) {
      const w = Math.floor(b / bpc);
      if (w !== cur) {
        if (cur >= 0 && cur < hits.length && !hits[cur]) { const cell = el.querySelector(`[data-w="${cur}"]`); if (cell) cell.classList.add('miss'); }
        cur = w;
        el.querySelectorAll('.vamp-chord').forEach((c, k) => c.classList.toggle('now', w >= 0 && k === w % 4));
        if (showTones && w >= 0 && w < hits.length) kb.setTargets(smooth()[w % 4].map(m => ({ midi: m, hand: 'R' })));
      }
      const c = el.querySelector('.count');
      if (c) c.textContent = b < 0 ? `count-in ${Math.floor(b) + 5}` : `chorus ${Math.min(CYCLES, Math.floor(b / (4 * bpc)) + 1)} of ${CYCLES}`;
    }
    function finish(completed) {
      clearInterval(timer); kb.setTargets([]);
      const made = hits.filter(Boolean).length, smoothN = hits.filter(h => h === 'smooth').length;
      const judged = completed ? hits.length : Math.max(0, Math.min(hits.length, cur));
      if (judged >= 4) {
        result = { made, smooth: smoothN, of: judged, pct: made / judged, tempo: bpm };
        result.clean = completed && result.pct >= 0.9 && smoothN >= made * 0.75;
        const lv = lad().record(result.clean);
        levelMsg = lv.up ? `Level up: ♩ ${bpm} → ${lv.bpm}` : lv.down ? `Back to ♩ ${lv.bpm} for a while` : '';
        bpm = lv.bpm;
        const V = (store.progress.keys.vamp ||= {});
        const best = V[bpc] || { pct: 0, bpm: 0 };
        if (result.pct > best.pct || (result.pct === best.pct && bpm > best.bpm)) V[bpc] = { pct: result.pct, bpm };
        store.save();
        store.log({ drill: 'vamp', beatsPerChord: bpc, ...result });
        if (result.clean) { cleanToday++; if (!goalMet && cleanToday >= goal) { goalMet = true; ctx.done(result); } }
      }
      take = null;
      draw();
    }
    const len = { 8: '2 bars', 4: '1 bar', 2: '2 beats', 1: '1 beat' };
    const names = (v, c) => heldNames(v, c).join(' ');
    async function demo() {
      if (demoing || (take && take.running)) return;
      await audio.init();
      demoing = true; demoed.add(chords.map(c => c.id).join()); draw();
      const vs = smooth(), step = 1.1, t0 = audio.now() + 0.1;
      vs.forEach((v, k) => {
        audio.chord(v, step * 0.95, t0 + k * step, 0.42);
        setTimeout(() => { kb.clearPressed(); v.forEach(m => kb.press(m, 'neutral')); el.querySelectorAll('.vamp-chord').forEach((c, j) => c.classList.toggle('now', j === k)); }, (t0 + k * step - audio.now()) * 1000);
      });
      setTimeout(() => { kb.clearPressed(); demoing = false; draw(); }, (0.1 + vs.length * step) * 1000 + 200);
    }
    function draw() {
      const running = take && take.running, seen = demoed.has(chords.map(c => c.id).join());
      const vs = smooth(), left = UP_AFTER - lad().streak;
      render(el, html`
        <div class="card drill-card vamp">
          <div class="pat-top"><span class="muted small">Comp each chord on its downbeat, moving to the closest voicing.</span>
            <div class="goal" title="Clean runs today">${Array.from({ length: goal }, (_, k) => html`<i class="${k < cleanToday ? 'on' : ''}"></i>`)}<span>${goalMet ? '✓ today’s goal' : `${cleanToday} of ${goal} clean runs`}</span></div></div>
          <div class="vamp-row">${chords.map((c, k) => html`<div class="vamp-chord"><b>${c.symbol}</b><span>${showTones || demoing ? names(vs[k], c) : len[bpc]}</span></div>`)}</div>
          <div class="vamp-grid">${Array.from({ length: CYCLES * 4 }, (_, w) => html`<i data-w="${w}" class="${result || running ? (hits[w] === 'smooth' ? 'hit' : hits[w] === 'jumpy' ? 'jumpy' : w < cur || result ? 'miss' : '') : ''}" title="${chords[w % 4].symbol}"></i>`)}</div>
          <div class="row">
            ${seen || running ? html`<button class="btn primary" data-a="go" ${demoing ? 'disabled' : ''}>${running ? 'Stop' : 'Start'} <kbd>Space</kbd></button><button class="btn" data-a="hear" ${running || demoing ? 'disabled' : ''}>▶ Show me again</button>`
              : html`<button class="btn primary" data-a="hear" ${demoing ? 'disabled' : ''}>▶ Show me first</button><button class="btn" data-a="go">Start <kbd>Space</kbd></button>`}
            <button class="btn" data-a="new" ${running ? 'disabled' : ''}>New chords</button>
            <span class="tempo" title="Your level at this chord length. It goes up after ${UP_AFTER} clean runs in a row."><button class="btn ghost" data-t="-${STEP}" ${running ? 'disabled' : ''}>−</button><b>♩ = ${bpm}</b><button class="btn ghost" data-t="${STEP}" ${running ? 'disabled' : ''}>+</button></span>
            <select data-a="len" ${running ? 'disabled' : ''} aria-label="Length of each chord">${[8, 4, 2, 1].map(n => html`<option value="${n}" ${n === bpc ? 'selected' : ''}>${len[n]} each</option>`)}</select>
            <label class="check"><input type="checkbox" data-a="tones" ${showTones ? 'checked' : ''}> Show the closest voicings</label>
            <span class="count muted">${demoing ? 'Watch: each chord moves as little as possible.' : ''}</span>
          </div>
          <p class="level muted small">${levelMsg ? html`<b class="ok">${levelMsg}</b> · ` : ''}${left > 0 && left < UP_AFTER ? `${left} more clean run${left > 1 ? 's' : ''} in a row to go up to ♩ ${bpm + STEP}.` : `${UP_AFTER} clean runs in a row move you up a level.`} Clean: 90% on time and 3 in 4 changes to the closest voicing.</p>
          ${result ? html`<div class="verdicts ${result.clean ? 'pass' : ''}"><div class="verdict-title">${result.clean ? '✓ Clean run' : 'Not yet'}: ${result.made} of ${result.of} on time · ${result.smooth} to the closest voicing</div>
            <div class="${result.clean ? 'ok' : 'warn'}">${result.clean ? (bpc > 1 ? 'Solid. When the tempo feels easy, try a shorter chord length.' : 'One chord per beat: that’s fast!') : result.pct < 0.9 ? 'Red = missed. Look ahead to the next chord while holding this one.' : 'Amber = on time but the hand jumped. Keep the shared notes and move the others by a step.'}</div></div>` : ''}
        </div>`);
      el.querySelector('[data-a=go]').onclick = start;
      el.querySelector('[data-a=hear]').onclick = demo;
      el.querySelector('[data-a=new]').onclick = () => { chords = pickChords(cfg.qualities || ['maj7', '7', 'm7']); result = null; draw(); if (!demoed.has(chords.map(c => c.id).join())) setTimeout(demo, 300); };
      el.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => { bpm = Math.max(50, Math.min(220, bpm + +b.dataset.t)); lad().set(bpm); levelMsg = ''; draw(); }; });
      el.querySelector('[data-a=len]').onchange = e => { bpc = +e.target.value; bpm = lad().bpm; result = null; draw(); };
      el.querySelector('[data-a=tones]').onchange = e => { showTones = e.target.checked; if (!showTones) kb.setTargets([]); draw(); };
    }
    draw();
    setTimeout(() => { if (!take && !demoed.has(chords.map(c => c.id).join())) demo(); }, 600);
    return {
      noteOn() { setTimeout(check, 60); },
      noteOff() {},
      get take() { return take; }, // for debugging
      onSpace() { start(); },
      destroy() { clearInterval(timer); if (take) { take.onEnd = null; take.stop(); } kb.setTargets([]); },
    };
  },
};
