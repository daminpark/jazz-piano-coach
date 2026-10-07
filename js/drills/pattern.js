// Shared engine for played exercises drawn as a note lane (Coordination Exercise 1, technique patterns):
// it shows you first (sound + keys), then you play along after a count-in. Each take is checked note by note
// and, for swung exercises, pair by pair (offbeat in the swing zone? louder than its beat?).
// Tempo goes up a level after a few clean takes in a row, and the step is done after today's clean takes.
import { html, render } from '../html.js';
import { midiName } from '../theory.js';
import { audio } from '../audio.js';
import { Take, matchNotes, mean } from '../lib/tempo.js';
import { analyzeSwing, pairStats, swingVerdicts } from '../lib/swing.js';
import { ladder, UP_AFTER, STEP } from '../lib/ladder.js';

const demoed = new Set(); // exercises already demonstrated this visit

/** judge a take against the exercise: notes, timing, and per-pair swing feel */
export function judgeTake(ex, played, bpm, { minAccuracy = 0.9, offbeat = 'offbeat' } = {}) {
  const m = matchNotes(ex.notes, played, ex.tol || (ex.swing ? 0.25 : 0.3));
  const beatMs = 60000 / bpm;
  const accuracy = m.pairs.length / ex.notes.length;
  const timing = mean(m.pairs.map(x => Math.abs(x.d) * beatMs));
  const v = [{ ok: accuracy >= minAccuracy, text: `Notes: ${m.pairs.length} of ${ex.notes.length} right${m.extra.length ? `, ${m.extra.length} extra` : ''}.` }];
  if (timing != null) v.push({ ok: timing <= 50, soft: true, text: `Timing: ${Math.round(timing)} ms off the grid on average.` });
  let stats = null;
  if (ex.swing) {
    // pair each offbeat with the note on the beat just before it (same hand, same beat)
    const beatOf = e => Math.floor(e.beat + 1e-6);
    const rh = m.pairs.filter(x => x.e.hand === 'R');
    const onBeat = new Map(rh.filter(x => !x.e.off && Math.abs(x.e.beat - beatOf(x.e)) < 1e-6).map(x => [beatOf(x.e), x]));
    const pairs = rh.filter(x => x.e.off && onBeat.has(beatOf(x.e)))
      .map(x => ({ placement: x.p.beat - beatOf(x.e), offVel: x.p.vel, onVel: onBeat.get(beatOf(x.e)).p.vel }));
    const sec = 60 / bpm;
    const legato = ex.legato === false ? null : analyzeSwing(played.filter(p => p.hand === 'R').map(p => ({ t: p.beat * sec, off: p.offBeat == null ? null : p.offBeat * sec, vel: p.vel, midi: p.midi })), 0, sec).legato;
    stats = { ...pairStats(pairs), legato };
    if (stats.pairs) v.push(...swingVerdicts(stats, { offbeat }).map(x => (x.text.startsWith('Legato') ? { ...x, soft: true } : x)));
  }
  const clean = accuracy >= minAccuracy && (!ex.swing || !!(stats && stats.pairs && stats.zoneOk && stats.louderOk));
  return { accuracy, timing, stats, verdicts: v, clean, match: m };
}

/**
 * spec: {
 *   title, levelKey(cfg), startTempo(cfg), goal(cfg) -> clean takes for today's step,
 *   sets(cfg, P) -> [{ id, label }], setStatus(cfg, id, P) -> 'pass' | 'tried' | '',
 *   exercise(cfg, id) -> { notes: [{beat, midi, hand, off}], beats, labels?, swing, split, sub? },
 *   how(cfg) -> { short, long }, minAccuracy, offbeat, record(ctx, id, result, bpm),
 *   accompaniment(ex, bpm, settings) -> events, controls?(settings) -> html, wire?(el, settings, redraw)
 * }
 */
export function patternDrill(spec) {
  return {
    title: spec.title,
    mount(ctx) {
      const { el, cfg, store, kb } = ctx;
      const P = store.progress, S = store.settings;
      const lad = ladder(store, spec.levelKey(cfg), { start: spec.startTempo(cfg) });
      const sets = spec.sets(cfg, P);
      const goal = spec.goal(cfg, sets);
      let setId = (sets.find(s => spec.setStatus(cfg, s.id, P) !== 'pass') || sets[0]).id;
      let ex = spec.exercise(cfg, setId);
      let take = null, played = [], open = new Map(), result = null, lastBeat = -1, cleanToday = 0, levelMsg = '', goalMet = false;
      let guide = S.patternGuide !== false;
      const demoKey = () => `${spec.levelKey(cfg)}:${setId}`;

      const bpm = () => lad.bpm;
      async function run(demo) {
        if (take && take.running) { take.stop(false); return; }
        await audio.init();
        result = null; played = []; open.clear(); lastBeat = -1; levelMsg = '';
        const b = 60 / bpm();
        const notes = demo ? ex.notes.map(n => ({ t: n.beat * b, kind: 'note', midi: n.midi, dur: n.hand === 'L' ? b * (n.len || 0.9) : b * (n.len || (ex.swing ? (n.off ? 0.32 : 0.64) : 0.9)), vel: n.hand === 'L' ? 0.3 : n.off ? 0.52 : 0.36 })) : [];
        take = new Take({ bpm: bpm(), beats: ex.beats, events: [...notes, ...spec.accompaniment(ex, bpm(), S)], onBeat, onEnd: demo ? endDemo : finish });
        take.demo = demo;
        if (demo) demoed.add(demoKey());
        await take.start();
        draw();
      }
      function endDemo() { take = null; kb.setTargets([]); draw(); }
      function onBeat(b) {
        const ph = el.querySelector('.lane-head');
        if (ph) ph.setAttribute('x', String(30 + Math.max(0, Math.min(ex.beats, b)) * (640 / ex.beats)));
        const idx = Math.floor(b + 0.1);
        if (idx === lastBeat) return;
        lastBeat = idx;
        const c = el.querySelector('.count');
        if (c) c.textContent = b < 0 ? `count-in ${4 + idx + 1}` : idx < ex.beats ? `bar ${Math.floor(idx / 4) + 1} · beat ${(idx % 4) + 1}` : '';
        if (guide || (take && take.demo)) kb.setTargets(ex.notes.filter(n => Math.floor(n.beat + 1e-6) === Math.max(0, idx)).map(n => ({ midi: n.midi, hand: n.hand })));
      }
      function finish(completed) {
        kb.setTargets([]);
        for (const p of open.values()) p.offBeat = take.beatNow();
        open.clear();
        if (!completed && played.length < ex.notes.length * 0.4) { take = null; draw(); return; }
        const tempo = bpm();
        result = judgeTake(ex, played, tempo, { minAccuracy: spec.minAccuracy || 0.9, offbeat: (typeof spec.offbeat === 'function' ? spec.offbeat(cfg) : spec.offbeat) || 'offbeat' });
        result.tempo = tempo;
        spec.record(ctx, setId, result, tempo);
        const lv = lad.record(result.clean);
        levelMsg = lv.up ? `Level up: ♩ ${tempo} → ${lv.bpm}` : lv.down ? `Back to ♩ ${lv.bpm} for a while` : '';
        if (result.clean) {
          cleanToday++;
          if (!goalMet && cleanToday >= goal) { goalMet = true; ctx.done({ clean: cleanToday }); }
          // move on to the next set that isn't done yet, so the clean takes cover all of them
          const i = sets.findIndex(s => s.id === setId);
          const next = sets.slice(i + 1).concat(sets.slice(0, i + 1)).find(s => spec.setStatus(cfg, s.id, P) !== 'pass') || sets[(i + 1) % sets.length];
          if (next.id !== setId) { result.nextLabel = next.label; setId = next.id; ex = spec.exercise(cfg, setId); }
        }
        take = null;
        draw();
      }
      function lane() {
        const ms = ex.notes.map(n => n.midi), lo = Math.min(...ms) - 1, hi = Math.max(...ms) + 1, H = 160;
        const X = b => 30 + b * (640 / ex.beats), Y = m => 14 + (hi - m) / (hi - lo) * (H - 24);
        const hit = result && !result.nextLabel ? result.match.hit : null;
        return html`<svg class="lane" viewBox="0 0 690 ${H}">
          ${Array.from({ length: ex.beats / 4 + 1 }, (_, k) => html`<line x1="${X(4 * k) - 6}" x2="${X(4 * k) - 6}" y1="4" y2="${H - 4}" class="barline"></line>`)}
          ${Array.from({ length: ex.beats }, (_, b) => html`<line x1="${X(b)}" x2="${X(b)}" y1="12" y2="${H - 4}" class="beatline"></line>`)}
          ${(ex.labels || []).map(l => html`<text x="${X(l.beat)}" y="10" class="lane-label">${l.text}</text>`)}
          ${ex.notes.map((n, k) => html`<circle cx="${X(n.beat)}" cy="${Y(n.midi)}" r="${n.hand === 'L' ? 3.5 : 4.5}" class="${!hit ? `n-${n.hand}` : hit.has(k) ? 'n-ok' : 'n-miss'}"><title>${midiName(n.midi)}</title></circle>`)}
          ${result && !result.nextLabel ? played.map(p => html`<line x1="${X(p.beat)}" x2="${X(p.beat)}" y1="${Y(p.midi) - 7}" y2="${Y(p.midi) + 7}" class="pl"></line>`) : ''}
          <rect class="lane-head" x="30" y="2" width="2" height="${H - 4}"></rect>
        </svg>`;
      }
      function draw() {
        const running = take && take.running, demoing = running && take.demo;
        const how = spec.how(cfg);
        const left = UP_AFTER - lad.streak;
        render(el, html`
          <div class="card drill-card coord pattern">
            <div class="pat-top">
              <div class="chips">${sets.map(s => { const st = spec.setStatus(cfg, s.id, P); return html`<button class="chip ${s.id === setId ? 'on' : ''} ${st}" data-set="${s.id}" ${running ? 'disabled' : ''}>${s.label}${st === 'pass' ? ' ✓' : ''}</button>`; })}</div>
              <div class="goal" title="Clean takes today">${Array.from({ length: goal }, (_, k) => html`<i class="${k < cleanToday ? 'on' : ''}"></i>`)}<span>${goalMet ? '✓ today’s goal' : `${cleanToday} of ${goal} clean`}</span></div>
            </div>
            <p class="pat-short">${how.short}${ex.sub ? html` <span class="muted">· ${ex.sub}</span>` : ''}</p>
            ${lane()}
            <div class="row coord-controls">
              ${running && !demoing ? html`<button class="btn" data-a="go">Stop</button>` : html`<b class="g-turn">${demoing ? 'Watch…' : 'Play any key to start'}</b>`}
              <button class="btn ghost small" data-a="demo" ${running ? 'disabled' : ''}>↻ Show me again</button>
              <span class="tempo" title="Your level. It goes up by itself after ${UP_AFTER} clean takes in a row."><button class="btn ghost" data-t="-${STEP}" ${running ? 'disabled' : ''}>−</button><b>♩ = ${bpm()}</b><button class="btn ghost" data-t="${STEP}" ${running ? 'disabled' : ''}>+</button></span>
              ${spec.controls ? spec.controls(S, running) : ''}
              <label class="check"><input type="checkbox" data-a="guide" ${guide ? 'checked' : ''}> Light up the keys</label>
              <span class="count muted">${demoing ? 'Watch and listen…' : ''}</span>
            </div>
            <p class="level muted small">${levelMsg ? html`<b class="ok">${levelMsg}</b> · ` : ''}${left > 0 && left < UP_AFTER ? `${left} more clean take${left > 1 ? 's' : ''} in a row to go up to ♩ ${bpm() + STEP}.` : `${UP_AFTER} clean takes in a row move you up a level (♩ +${STEP}).`}</p>
            ${result ? html`<div class="verdicts ${result.clean ? 'pass' : ''}">
                <div class="verdict-title">${result.clean ? `✓ Clean at ♩ = ${result.tempo || ''}` : 'Not yet: same again'}${result.nextLabel ? html` <span class="muted small">· next up: ${result.nextLabel}</span>` : ''}</div>
                ${result.verdicts.map(v => html`<div class="${v.ok ? 'ok' : v.soft ? 'warn' : 'bad'}">${v.ok ? '✓' : '✗'} ${v.text}</div>`)}
              </div>` : ''}
            <details class="how-more"><summary>How to do it</summary><p>${how.long}</p></details>
          </div>`);
        const go = el.querySelector('[data-a=go]'); if (go) go.onclick = () => run(false);
        const hd = el.querySelector('.coord-controls .count'); if (hd && demoing) hd.textContent = '';
        const dm = el.querySelector('[data-a=demo]'); if (dm) dm.onclick = () => run(true);
        el.querySelectorAll('[data-t]').forEach(b => { b.onclick = () => { lad.set(bpm() + +b.dataset.t); levelMsg = ''; draw(); }; });
        el.querySelectorAll('[data-set]').forEach(b => { b.onclick = () => { setId = b.dataset.set; ex = spec.exercise(cfg, setId); result = null; played = []; draw(); if (!demoed.has(demoKey())) setTimeout(() => run(true), 300); }; });
        el.querySelector('[data-a=guide]').onchange = e => { guide = e.target.checked; S.patternGuide = guide; store.save(); if (!guide) kb.setTargets([]); };
        if (spec.wire) spec.wire(el, S, draw, store);
      }
      draw();
      // demonstrate before the first take
      if (!demoed.has(demoKey())) setTimeout(() => { if (!take) run(true); }, 600);
      return {
        noteOn(m, vel, t) {
          if (!take) { run(false); return; } // play any key to start a take (that key only starts it)
          if (!take.running || take.demo) return;
          const p = { midi: m, vel, beat: take.beatAt(t), hand: m < ex.split ? 'L' : 'R' };
          if (p.beat < -0.5) return;
          played.push(p); open.set(m, p);
          kb.press(m, ex.notes.some(n => n.midi === m && Math.abs(n.beat - p.beat) < 0.3) ? 'ok' : 'bad');
        },
        noteOff(m, t) { const p = open.get(m); if (p && take) { p.offBeat = take.beatAt(t); open.delete(m); } },
        onSpace() { if (!(take && take.demo)) run(false); },
        get take() { return take; }, // for debugging
        busy: () => !!(take && take.running),
        destroy() { if (take) { take.onEnd = null; take.stop(); } kb.setTargets([]); },
      };
    },
  };
}
