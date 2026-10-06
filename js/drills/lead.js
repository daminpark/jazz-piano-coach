// Closest inversion, fast: a chain of chords. From wherever your hand is, play the next chord in the voicing that
// moves least. Each change is timed and compared with the smallest possible movement. Common tones can stay held.
// The time target tightens as you get quicker (levels are remembered between days).
import { html, render } from '../html.js';
import { chord as mkChord, deck, matchesChord, heldNames, movement, closestVoicing, KEYS_FOURTHS } from '../theory.js';
import { audio } from '../audio.js';

export const PROGRESSIONS = {
  random: { label: 'Random', about: 'chords in any order' },
  iiVI: { label: 'ii–V–I', about: 'ii–V–I through the keys (Dm7 G7 Cmaj7, Gm7 C7 Fmaj7, …)' },
  fourths: { label: 'Circle of fourths', about: 'each chord a fourth up from the last' },
  blues: { label: 'B♭ blues', about: 'the chord changes of a blues in B♭' },
};
const TARGETS = [4000, 3000, 2500, 2000, 1600, 1300, 1000]; // ms per change, level by level
const IN_A_ROW = 8; // good changes in a row to reach the next target
const SLACK = 2; // semitones over the best possible that still count as closest
const minor = r => ({ Db: 'C#', Ab: 'G#', Gb: 'F#' }[r] || r);
const major = r => (r === 'Gb' ? 'F#' : r); // spelled as in the flash-card deck, so times count toward the same cards

function chain(kind, qualities, n) {
  const out = [];
  if (kind === 'iiVI') {
    // ii of each major key, around the circle: Dm7 G7 Cmaj7 | Gm7 C7 Fmaj7 | …
    const ii = { C: 'D', F: 'G', Bb: 'C', Eb: 'F', Ab: 'Bb', Db: 'Eb', Gb: 'Ab', B: 'C#', E: 'F#', A: 'B', D: 'E', G: 'A' };
    const V = { C: 'G', F: 'C', Bb: 'F', Eb: 'Bb', Ab: 'Eb', Db: 'Ab', Gb: 'Db', B: 'F#', E: 'B', A: 'E', D: 'A', G: 'D' };
    for (let k = 0; out.length < n; k++) { const key = KEYS_FOURTHS[k % 12]; out.push(mkChord(minor(ii[key]), 'm7'), mkChord(major(V[key]), '7'), mkChord(major(key), 'maj7')); }
  } else if (kind === 'fourths') {
    const q = qualities[0] || '7';
    for (let k = 0; out.length < n; k++) out.push(mkChord(q === 'm7' ? minor(KEYS_FOURTHS[k % 12]) : major(KEYS_FOURTHS[k % 12]), q));
  } else if (kind === 'blues') {
    const B = ['Bb', 'Eb', 'Bb', 'Eb', 'Bb', 'F', 'Eb', 'Bb', 'F'];
    for (let k = 0; out.length < n; k++) out.push(mkChord(B[k % B.length], '7'));
  } else {
    const d = deck(qualities);
    while (out.length < n) { const c = d[Math.floor(Math.random() * d.length)]; if (!out.length || out[out.length - 1].id !== c.id) out.push(c); }
  }
  return out.slice(0, n);
}

const demoed = new Set();

export const lead = {
  title: 'Closest inversion',
  mount(ctx) {
    const { el, cfg, store, kb } = ctx;
    const kind = cfg.progression || 'random', qualities = cfg.qualities || ['maj7', '7', 'm7'];
    const goal = cfg.goal || 20;
    const lv = (((store.progress.levels ||= {})[`lead:${kind}`]) ||= { level: 0, streak: 0 });
    let seq = chain(kind, qualities, 400), i = 0, prev = null, shownAt = 0, timer = 0, state = 'start', last = null, good = 0, streak = 0, levelMsg = '', demoing = false;
    const times = [], costs = [];
    const target = () => TARGETS[Math.min(lv.level, TARGETS.length - 1)];
    const cur = () => seq[i];

    function evaluate() {
      const held = [...ctx.held()];
      if (held.length < 3 || !matchesChord(held, cur())) return;
      const voicing = held.slice().sort((a, b) => a - b);
      if (state === 'start') { prev = voicing; i++; state = 'chain'; shownAt = performance.now(); draw(); return; }
      const ms = performance.now() - shownAt;
      const { voicing: best, cost: bestCost } = closestVoicing(prev, cur());
      const cost = movement(prev, voicing);
      const close = cost <= bestCost + SLACK, fast = ms <= target();
      last = { symbol: cur().symbol, ms, cost, bestCost, close, fast, best, from: prev, fromChord: seq[i - 1], chord: cur() };
      times.push(ms); costs.push(cost - bestCost);
      // finding the chord counts toward the flash-card gate too ("all 36 under 3 seconds")
      const card = ((store.progress.cards ||= {})[cur().id] ||= { times: [], wrong: 0, n: 0, miss: 0 });
      card.n++; card.times.push(Math.round(ms)); if (card.times.length > 5) card.times.shift();
      levelMsg = '';
      if (close) good++;
      if (close && fast) {
        streak++; lv.streak = streak;
        if (streak >= IN_A_ROW && lv.level < TARGETS.length - 1) { lv.level++; streak = 0; levelMsg = `Level up: now under ${(target() / 1000).toFixed(1)} s`; }
      } else streak = 0;
      store.save();
      if (good === goal) { store.log({ drill: 'lead', kind, changes: times.length, good, medianMs: median(times) }); ctx.done({ good }); }
      for (const m of voicing) kb.press(m, close ? 'ok' : 'bad');
      if (!close) kb.setTargets(best.map(m => ({ midi: m, hand: 'R' })));
      prev = voicing; i++; shownAt = performance.now();
      draw();
    }
    const median = xs => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
    const names = (v, c) => heldNames(v, c).join(' '); // spelled like the chord (D♯ in B7, not E♭)

    async function demo() {
      if (demoing) return;
      await audio.init();
      demoing = true; draw();
      // four changes from a comfortable start, each to the closest voicing, with the keys lit
      const sample = chain(kind, qualities, 5);
      let v = closeVoicings0(sample[0]);
      const step = 1.1;
      sample.forEach((c, k) => {
        if (k) v = closestVoicing(v, c).voicing;
        const vv = v.slice(), t = audio.now() + 0.1 + k * step;
        audio.chord(vv, step * 0.95, t, 0.4);
        setTimeout(() => { kb.clearPressed(); vv.forEach(m => kb.press(m, 'neutral')); const s = el.querySelector('.lead-demo'); if (s) s.textContent = `${c.symbol}: ${names(vv, c)}`; }, (t - audio.now()) * 1000);
      });
      setTimeout(() => { kb.clearPressed(); demoing = false; demoed.add(kind); draw(); }, (0.1 + sample.length * step) * 1000 + 200);
    }
    const closeVoicings0 = c => closestVoicing([60, 64, 67, 71], c).voicing; // start near middle C

    function draw() {
      const c = cur(), nxt = seq[i + 1];
      const seen = demoed.has(kind);
      render(el, html`
        <div class="card drill-card lead">
          <div class="pat-top">
            <div class="muted small">${PROGRESSIONS[kind].label}: ${PROGRESSIONS[kind].about}</div>
            <div class="goal" title="Changes to the closest voicing today">${Array.from({ length: Math.min(goal, 24) }, (_, k) => html`<i class="${k < Math.round(good * Math.min(goal, 24) / goal) ? 'on' : ''}"></i>`)}<span>${good >= goal ? '✓ today’s goal' : `${good} of ${goal}`}</span></div>
          </div>
          ${demoing ? html`<div class="flash-symbol lead-demo">…</div><p class="center muted">Watch: each chord moves to the closest voicing.</p>`
            : html`
            <div class="lead-row">
              <div class="lead-from"><span class="muted small">${state === 'start' ? 'Start anywhere around middle C' : 'From'}</span><b>${state === 'start' ? '' : seq[i - 1].symbol}</b><span class="muted small">${prev ? names(prev, seq[i - 1]) : ''}</span></div>
              <div class="lead-arrow">→</div>
              <div class="lead-to"><div class="flash-symbol">${c.symbol}</div><span class="muted small">then ${nxt ? nxt.symbol : ''}</span></div>
            </div>
            <p class="center hearing muted small"></p>`}
          ${last ? html`<div class="verdicts ${last.close && last.fast ? 'pass' : ''}">
              <div class="verdict-title">${last.close ? '✓' : '✗'} ${last.symbol}: moved ${last.cost} semitone${last.cost === 1 ? '' : 's'} (closest possible: ${last.bestCost}) · ${(last.ms / 1000).toFixed(1)} s${last.fast ? '' : ` (target ${(target() / 1000).toFixed(1)} s)`}</div>
              ${last.close ? '' : html`<div class="warn">Closest from ${names(last.from, last.fromChord)} was <b>${names(last.best, last.chord)}</b> (shown on the keys). Keep the shared notes and move the others by a step.</div>`}
            </div>` : ''}
          <div class="row">
            ${seen ? html`<button class="btn" data-a="demo" ${demoing ? 'disabled' : ''}>▶ Show me again</button>` : html`<button class="btn primary" data-a="demo" ${demoing ? 'disabled' : ''}>▶ Show me first</button>`}
            <button class="btn ghost" data-a="restart">Start over</button>
            <span class="muted small">Target: under ${(target() / 1000).toFixed(1)} s and the closest voicing. ${IN_A_ROW - streak} more in a row to go faster.</span>
          </div>
          ${levelMsg ? html`<p class="ok small"><b>${levelMsg}</b></p>` : ''}
          ${times.length ? html`<p class="muted small">This session: ${times.length} changes · ${good} closest · median ${(median(times) / 1000).toFixed(1)} s</p>` : ''}
          <details class="how-more"><summary>How to do it</summary><p>One hand, four notes, close together. Play the first chord anywhere around middle C. Then play each new chord in whichever inversion is nearest to where your hand already is: keep the notes the two chords share, and move the others to the nearest new note, usually a step. You can keep shared notes held down. A change counts if it moves no more than ${SLACK} semitones more than the closest possible voicing, within the time target. ${IN_A_ROW} in a row lower the target.</p></details>
        </div>`);
      const dm = el.querySelector('[data-a=demo]'); if (dm) dm.onclick = demo;
      el.querySelector('[data-a=restart]').onclick = () => { seq = chain(kind, qualities, 400); i = 0; prev = null; state = 'start'; last = null; streak = 0; kb.setTargets([]); draw(); };
      paintHearing();
    }
    function paintHearing() {
      const n = el.querySelector('.hearing'); if (!n) return;
      const held = [...ctx.held()];
      n.textContent = held.length ? `Hearing: ${heldNames(held, cur()).join(' ')}` : state === 'start' ? 'Play the first chord to begin.' : 'Play it.';
    }
    draw();
    if (!demoed.has(kind)) setTimeout(demo, 600);
    return {
      noteOn() { if (demoing) return; kb.setTargets([]); paintHearing(); clearTimeout(timer); timer = setTimeout(evaluate, 120); },
      noteOff() { if (demoing) return; paintHearing(); clearTimeout(timer); timer = setTimeout(evaluate, 120); },
      destroy() { clearTimeout(timer); kb.setTargets([]); },
    };
  },
};
