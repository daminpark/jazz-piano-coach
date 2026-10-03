// Vamp: four random seventh chords loop over bass and drums; play each chord when it comes around.
// Each chord window counts as made if you're holding exactly that chord at some point in it (a little early is fine).
import { html, render } from '../html.js';
import { deck, matchesChord } from '../theory.js';
import { audio, swingGroove } from '../audio.js';
import { Take } from '../lib/tempo.js';

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
    let bpc = cfg.beatsPerChord || 8, bpm = cfg.tempo || 100, take = null, hits = [], cur = -1, showTones = false, result = null, timer = 0;
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
      hits = Array(CYCLES * 4).fill(false); cur = -1; result = null;
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
      if (matchesChord([...ctx.held()], chords[w % 4])) {
        hits[w] = true;
        for (const m of ctx.held()) kb.press(m, 'ok');
        const cell = el.querySelector(`[data-w="${w}"]`); if (cell) cell.classList.add('hit');
      }
    }
    function onBeat(b) {
      const w = Math.floor(b / bpc);
      if (w !== cur) {
        if (cur >= 0 && cur < hits.length && !hits[cur]) { const cell = el.querySelector(`[data-w="${cur}"]`); if (cell) cell.classList.add('miss'); }
        cur = w;
        el.querySelectorAll('.vamp-chord').forEach((c, k) => c.classList.toggle('now', w >= 0 && k === w % 4));
        if (showTones && w >= 0 && w < hits.length) kb.setTargets(voicing(chords[w % 4]).map(m => ({ midi: m, hand: 'R' })));
      }
      const c = el.querySelector('.count');
      if (c) c.textContent = b < 0 ? `count-in ${Math.floor(b) + 5}` : `chorus ${Math.min(CYCLES, Math.floor(b / (4 * bpc)) + 1)} of ${CYCLES}`;
    }
    const voicing = c => { const r = 60 + c.pcs[0] - (c.pcs[0] >= 7 ? 12 : 0); return c.pcs.map(pc => r + ((pc - c.pcs[0] + 12) % 12)); };
    function finish(completed) {
      clearInterval(timer); kb.setTargets([]);
      const made = hits.filter(Boolean).length;
      const judged = completed ? hits.length : Math.max(0, Math.min(hits.length, cur));
      if (judged >= 4) {
        result = { made, of: judged, pct: made / judged };
        const V = (store.progress.keys.vamp ||= {});
        const best = V[bpc] || { pct: 0, bpm: 0 };
        if (result.pct > best.pct || (result.pct === best.pct && bpm > best.bpm)) V[bpc] = { pct: result.pct, bpm };
        store.save();
        store.log({ drill: 'vamp', beatsPerChord: bpc, bpm, ...result });
        if (completed) ctx.done(result);
      }
      take = null;
      draw();
    }
    const len = { 8: '2 bars', 4: '1 bar', 2: '2 beats', 1: '1 beat' };
    function draw() {
      const running = take && take.running;
      render(el, html`
        <div class="card drill-card vamp">
          <div class="vamp-row">${chords.map((c, k) => html`<div class="vamp-chord"><b>${c.symbol}</b><span>${len[bpc]}</span></div>`)}</div>
          <div class="vamp-grid">${Array.from({ length: CYCLES * 4 }, (_, w) => html`<i data-w="${w}" class="${result || running ? (hits[w] ? 'hit' : w < cur || result ? 'miss' : '') : ''}" title="${chords[w % 4].symbol}"></i>`)}</div>
          <div class="row">
            <button class="btn primary" data-a="go">${running ? 'Stop' : 'Start'} <kbd>Space</kbd></button>
            <button class="btn" data-a="new" ${running ? 'disabled' : ''}>New chords</button>
            <button class="btn ghost" data-a="hear" ${running ? 'disabled' : ''}>Hear them</button>
            <span class="tempo"><button class="btn ghost" data-t="-5" ${running ? 'disabled' : ''}>−</button><b>♩ = ${bpm}</b><button class="btn ghost" data-t="5" ${running ? 'disabled' : ''}>+</button></span>
            <select data-a="len" ${running ? 'disabled' : ''} aria-label="Length of each chord">${[8, 4, 2, 1].map(n => html`<option value="${n}" ${n === bpc ? 'selected' : ''}>${len[n]} each</option>`)}</select>
            <label class="check"><input type="checkbox" data-a="tones" ${showTones ? 'checked' : ''}> Show notes</label>
            <span class="count muted"></span>
          </div>
          ${result ? html`<div class="verdicts ${result.pct >= 0.9 ? 'pass' : ''}"><div class="verdict-title">${result.made} of ${result.of} chords on time (${Math.round(result.pct * 100)}%)</div>
            <div class="${result.pct >= 0.9 ? 'ok' : 'warn'}">${result.pct >= 0.9 ? (bpc > 1 ? 'Solid. Try the next shorter length.' : 'One chord per beat: that’s fast!') : 'Missed ones are red. Slow down, or look ahead to the next chord while holding this one.'}</div></div>`
          : html`<p class="muted small">${cfg.note || ''} Comp each chord on its downbeat (you can come in a touch early). Any voicing and inversion, one or both hands.</p>`}
        </div>`);
      el.querySelector('[data-a=go]').onclick = start;
      el.querySelector('[data-a=hear]').onclick = () => audio.init().then(() => chords.forEach((c, k) => audio.chord(voicing(c), 0.9, audio.now() + k * 0.8)));
      el.querySelector('[data-a=new]').onclick = () => { chords = pickChords(cfg.qualities || ['maj7', '7', 'm7']); result = null; draw(); };
      el.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => { bpm = Math.max(50, Math.min(220, bpm + +b.dataset.t)); draw(); }; });
      el.querySelector('[data-a=len]').onchange = e => { bpc = +e.target.value; result = null; draw(); };
      el.querySelector('[data-a=tones]').onchange = e => { showTones = e.target.checked; if (!showTones) kb.setTargets([]); };
    }
    draw();
    return {
      noteOn() { setTimeout(check, 60); },
      noteOff() {},
      get take() { return take; }, // for debugging
      onSpace() { start(); },
      destroy() { clearInterval(timer); if (take) { take.onEnd = null; take.stop(); } kb.setTargets([]); },
    };
  },
};
