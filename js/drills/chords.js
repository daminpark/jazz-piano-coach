// Chord flash cards: a chord symbol appears, you play it (any octave, any inversion, one or two hands).
// Timed from the card appearing to the moment the held notes are exactly that chord.
import { html, render } from '../html.js';
import { deck, matchesChord, identify, heldNames, noteLabel } from '../theory.js';

const INV = ['root position', '1st inversion', '2nd inversion', '3rd inversion'];
const TONE = ['root', '3rd', '5th', '7th'];
/** a card asking for an inversion: the chord written as a slash chord (Cmaj7/E = E at the bottom) */
const invCard = (c, k) => ({ ...c, inv: k, id: `${c.id}/${k}`, symbol: `${c.symbol}/${noteLabel(c.notes[k])}`, base: c.symbol });
import { cardTime } from '../curriculum.js';

const REVEAL_MS = 9000;
const fmt = ms => (ms >= 10000 ? `${Math.round(ms / 1000)} s` : `${(ms / 1000).toFixed(1)} s`);

function pickQueue(cards, stats, count, slowestFirst) {
  const time = c => cardTime(stats[c.id]);
  if (slowestFirst) {
    const sorted = cards.slice().sort((a, b) => time(b) - time(a));
    const q = []; while (q.length < count) q.push(...sorted.slice(0, count - q.length));
    return q;
  }
  // weighted shuffle: unseen and slow chords come up more often, and every chord at least once per pass
  const weight = c => { const t = time(c); return t === Infinity ? 4 : Math.min(4, 0.6 + t / 2000) + (stats[c.id]?.miss ? 1 : 0); };
  const q = [];
  while (q.length < count) {
    const pass = cards.map(c => ({ c, k: Math.random() ** (1 / weight(c)) })).sort((a, b) => b.k - a.k).map(x => x.c);
    q.push(...pass.slice(0, count - q.length));
  }
  for (let i = 1; i < q.length; i++) if (q[i].id === q[i - 1].id && i + 1 < q.length) [q[i], q[i + 1]] = [q[i + 1], q[i]];
  return q;
}

export const chords = {
  title: 'Chord flash cards',
  mount(ctx) {
    const { el, cfg, store, kb } = ctx;
    const P = store.progress;
    // bass: 'any' (any inversion), 'noRoot' (anything but root position), 'ask' (a named inversion, as a slash chord)
    const mode = cfg.bass || 'any';
    const base = deck(cfg.qualities || ['maj7', '7', 'm7']);
    const cards = mode === 'ask' ? base.flatMap(c => [1, 2, 3].map(k => invCard(c, k))) : base;
    const stats = mode === 'ask' ? (P.invCards ||= {}) : P.cards;
    const queue = pickQueue(cards, stats, cfg.count || base.length, cfg.slowestFirst);
    const lowestPc = held => Math.min(...held) % 12;
    const fits = (held, c) => matchesChord(held, c) && (mode === 'ask' ? lowestPc(held) === c.pcs[c.inv] : mode === 'noRoot' ? lowestPc(held) !== c.pcs[0] : true);
    let i = -1, shownAt = 0, wrong = 0, state = 'idle', revealTimer = 0, matchTimer = 0, answered = false;
    const results = [];
    const cur = () => queue[i];

    function next() {
      clearTimeout(revealTimer);
      i++;
      kb.setTargets([]);
      if (i >= queue.length) return finish();
      state = 'wait-release';
      wrong = 0; answered = false;
      draw();
      if (!ctx.held().size) begin();
    }
    function begin() {
      state = 'asking'; shownAt = performance.now();
      revealTimer = setTimeout(() => reveal(false), REVEAL_MS);
      draw();
    }
    function targetsOf(c) {
      // close position from the asked-for bass note (root position otherwise; 1st inversion for 'noRoot'), bass between G3 and F♯4
      const k = c.inv != null ? c.inv : mode === 'noRoot' ? 1 : 0;
      const bassPc = c.pcs[k], bass = 60 + bassPc - (bassPc >= 7 ? 12 : 0);
      return [0, 1, 2, 3].map(j => ({ midi: bass + ((c.pcs[(k + j) % 4] - bassPc + 12) % 12), hand: 'R', finger: [1, 2, 3, 5][j] }));
    }
    function reveal(asked) {
      if (state !== 'asking') return;
      state = 'revealed';
      kb.setTargets(targetsOf(cur()));
      record(null, asked);
      draw();
    }
    function record(ms, asked) {
      const c = cur(); answered = true;
      const s = (stats[c.id] ||= { times: [], wrong: 0, n: 0, miss: 0 });
      s.n++; s.wrong += wrong;
      if (ms == null) s.miss++; else { s.times.push(Math.round(ms)); if (s.times.length > 5) s.times.shift(); if (s.miss) s.miss--; }
      store.save();
      results.push({ id: c.id, symbol: c.symbol, ms, wrong, asked });
    }
    function check() {
      if (state !== 'asking' && state !== 'revealed') return;
      const held = [...ctx.held()];
      if (!fits(held, cur())) return;
      if (state === 'asking') { clearTimeout(revealTimer); record(performance.now() - shownAt); }
      state = 'correct';
      for (const m of held) kb.press(m, 'ok');
      draw();
      setTimeout(() => { if (state === 'correct') { state = 'wait-release'; draw(); if (!ctx.held().size) next(); } }, 700);
    }
    function finish() {
      state = 'done';
      const timed = results.filter(r => r.ms != null);
      const avg = timed.length ? timed.reduce((s, r) => s + r.ms, 0) / timed.length : null;
      const under3 = timed.filter(r => r.ms < 3000).length;
      const summary = { drill: 'chords', count: results.length, avg, under3, missed: results.length - timed.length, test: !!cfg.test };
      store.log(summary);
      ctx.done(summary);
      draw();
    }

    function hearing() {
      const held = [...ctx.held()];
      if (!held.length || state === 'done') return `Wrong notes this card: ${wrong}`;
      const name = identify(held), c = cur();
      let hint = '';
      if (c && matchesChord(held, c) && !fits(held, c)) {
        hint = mode === 'ask' ? ` · right notes; now put ${noteLabel(c.notes[c.inv])} at the bottom` : ' · right notes in root position; move the bottom note up an octave';
      }
      return `Hearing: ${heldNames(held, c).join(' ')}${name ? ` (${name})` : ''}${hint} · wrong notes: ${wrong}`;
    }
    const paintHearing = () => { const n = el.querySelector('.hearing'); if (n) n.textContent = hearing(); };
    function draw() {
      if (state === 'done') {
        const timed = results.filter(r => r.ms != null);
        const slow = results.slice().sort((a, b) => (b.ms ?? 1e9) - (a.ms ?? 1e9)).slice(0, 6);
        const all = deck(cfg.qualities || ['maj7', '7', 'm7']);
        render(el, html`
          <div class="card drill-card">
            <h3>Done: ${results.length} chords</h3>
            <div class="stat-row">
              <div class="stat"><b>${timed.length ? fmt(timed.reduce((s, r) => s + r.ms, 0) / timed.length) : '–'}</b><span>average</span></div>
              <div class="stat"><b>${timed.filter(r => r.ms < 3000).length}/${results.length}</b><span>under 3 s</span></div>
              <div class="stat"><b>${results.length - timed.length}</b><span>needed help</span></div>
            </div>
            <p class="muted">Slowest this round: ${slow.map((r, k) => html`${k ? ', ' : ''}<b>${r.symbol}</b> ${r.ms == null ? 'shown' : fmt(r.ms)}`)}</p>
            ${cfg.test ? html`<div class="chord-grid">${all.map(c => { const t = cardTime(P.cards[c.id]); return html`<span class="cg ${t < 3000 ? 'ok' : t < Infinity ? 'slow' : ''}" title="${t < Infinity ? fmt(t) : 'not yet'}">${c.symbol}</span>`; })}</div>` : ''}
            <div class="row"><button class="btn primary" data-a="again">Another round</button></div>
          </div>`);
        el.querySelector('[data-a=again]').onclick = () => ctx.restart();
        return;
      }
      const c = cur();
      const elapsed = state === 'asking' ? performance.now() - shownAt : 0;
      const seen = stats[c.id];
      render(el, html`
        <div class="card drill-card flash ${state}">
          <div class="flash-top"><span>${i + 1} / ${queue.length}</span><span>${cfg.label || 'Play the chord'}</span>
            <span>${seen && cardTime(seen) < Infinity ? html`your time: ${fmt(cardTime(seen))}` : 'new'}</span></div>
          <div class="flash-symbol">${c.symbol}</div>
          <div class="flash-sub">${state === 'wait-release' ? 'Let go of the keys…' : state === 'correct' ? html`<span class="ok">✓ ${c.notes.map(n => n.letter + ['𝄫', '♭', '', '♯', '𝄪'][n.acc + 2]).join(' ')}</span>`
            : state === 'revealed' ? html`<span class="warn">${targetsOf(c).map(t => c.notes[c.pcs.indexOf(t.midi % 12)]).map(n => n.letter + ['𝄫', '♭', '', '♯', '𝄪'][n.acc + 2]).join(' ')}</span> · play it to continue`
            : mode === 'ask' ? html`${INV[c.inv]}: the ${TONE[c.inv]} (${noteLabel(c.notes[c.inv])}) at the bottom` : mode === 'noRoot' ? 'any inversion except root position' : 'any octave, any inversion'}</div>
          <div class="flash-bar"><i style="width:${state === 'asking' ? 0 : 100}%"></i></div>
          <div class="row center"><button class="btn ghost" data-a="show" ${state !== 'asking' ? 'disabled' : ''}>Show me</button>
            <button class="btn ghost" data-a="skip">Skip</button></div>
          <p class="muted small center hearing">${hearing()}</p>
        </div>`);
      el.querySelector('[data-a=show]').onclick = () => reveal(true);
      el.querySelector('[data-a=skip]').onclick = () => { if (state === 'asking') record(null, true); next(); };
      const bar = el.querySelector('.flash-bar i');
      if (state === 'asking' && bar) requestAnimationFrame(() => { bar.style.transition = `width ${REVEAL_MS - elapsed}ms linear`; bar.style.width = '100%'; });
    }

    next();
    return {
      noteOn(m) {
        if (state === 'asking' && !cur().pcs.includes(m % 12)) { wrong++; kb.press(m, 'bad'); }
        paintHearing();
        clearTimeout(matchTimer); matchTimer = setTimeout(check, 120); // let a rolled chord settle
      },
      noteOff() {
        paintHearing();
        if (state === 'wait-release' && !ctx.held().size) {
          if (answered) next(); else begin();
        }
      },
      keyHint: 'Play the chord on your keyboard. Any inversion counts.',
      destroy() { clearTimeout(revealTimer); clearTimeout(matchTimer); kb.setTargets([]); },
    };
  },
};
