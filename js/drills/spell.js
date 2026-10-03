// Chord spelling quiz: write the four notes of a chord with correct letter names (E♭ G B♭ D, not D♯ G A♯ D).
import { html, render } from '../html.js';
import { deck, noteLabel, parseNote } from '../theory.js';

const ACC_KEYS = [['b', '♭'], ['#', '♯'], ['bb', '♭♭'], ['x', '♯♯']];
const norm = s => s.trim().replace(/♭/g, 'b').replace(/♯/g, '#').replace(/𝄫/g, 'bb').replace(/𝄪/g, 'x').replace(/^([a-g])/, c => c.toUpperCase());

export const spell = {
  title: 'Spell the chord',
  mount(ctx) {
    const { el, cfg, store } = ctx;
    const all = deck(cfg.qualities || ['maj7', '7', 'm7']);
    const queue = all.slice().sort(() => Math.random() - 0.5).slice(0, cfg.count || 12);
    let i = 0, answer = null, score = 0;
    const missed = [];

    function check(text) {
      const c = queue[i];
      const parts = text.split(/[\s,]+/).filter(Boolean).map(norm);
      const want = c.notes.map(noteLabel);
      let got;
      try { got = parts.map(p => noteLabel(parseNote(p))); } catch { return { error: 'Write notes like Eb, F#, Bbb, C.' }; }
      const ok = got.length === 4 && got.every((g, k) => g === want[k]);
      return { ok, got, want };
    }
    function draw() {
      if (i >= queue.length) {
        const q = (store.progress.quizzes.spell ||= { best: 0, n: 0 });
        q.n++; q.best = Math.max(q.best, score / queue.length); store.save();
        store.log({ drill: 'spell', score, of: queue.length });
        ctx.done({ score, of: queue.length });
        render(el, html`<div class="card drill-card"><h3>${score} / ${queue.length} spelled correctly</h3>
          ${missed.length ? html`<p>Review: ${missed.map((m, k) => html`${k ? ' · ' : ''}<b>${m.symbol}</b> = ${m.want.join(' ')}`)}</p>` : html`<p class="ok">Perfect spelling.</p>`}
          <div class="row"><button class="btn primary" data-a="again">Another round</button></div></div>`);
        el.querySelector('[data-a=again]').onclick = () => ctx.restart();
        return;
      }
      const c = queue[i];
      render(el, html`
        <div class="card drill-card spell">
          <div class="flash-top"><span>${i + 1} / ${queue.length}</span><span>Spell it root, 3rd, 5th, 7th</span><span>${score} right</span></div>
          <div class="flash-symbol">${c.symbol}</div>
          ${answer ? html`
            <div class="spell-answer">${answer.want.map((w, k) => html`<span class="${answer.got[k] === w ? 'ok' : 'bad'}">${answer.got[k] || '–'}${answer.got[k] !== w ? html` <small>→ ${w}</small>` : ''}</span>`)}</div>
            <div class="row center"><button class="btn primary" data-a="next">Next (Enter)</button></div>`
          : html`
            <form class="spell-form" autocomplete="off">
              <input name="a" placeholder="e.g. Eb G Bb D" aria-label="Notes of the chord" autofocus>
              <button class="btn primary">Check</button>
            </form>
            <div class="spell-pad">${'CDEFGAB'.split('').map(l => html`<button type="button" data-l="${l}">${l}</button>`)}
              ${ACC_KEYS.map(([k, s]) => html`<button type="button" class="acc" data-acc="${k}">${s}</button>`)}
              <button type="button" data-l=" ">space</button><button type="button" data-del="1">⌫</button></div>
            <p class="muted small center">Type b for ♭, # for ♯, bb for 𝄫, x for 𝄪. Each letter name appears exactly once.</p>`}
        </div>`);
      const form = el.querySelector('form');
      if (form) {
        const inp = form.querySelector('input'); inp.focus();
        form.onsubmit = e => {
          e.preventDefault();
          const r = check(inp.value);
          if (r.error) { inp.setCustomValidity(r.error); inp.reportValidity(); return; }
          answer = r; if (r.ok) score++; else missed.push({ symbol: c.symbol, want: r.want });
          draw();
        };
        inp.oninput = () => inp.setCustomValidity('');
        el.querySelector('.spell-pad').onclick = e => {
          const b = e.target.closest('button'); if (!b) return;
          if (b.dataset.del) inp.value = inp.value.replace(/\s*\S$/, '');
          else if (b.dataset.acc) inp.value += b.dataset.acc;
          else inp.value += (inp.value && !inp.value.endsWith(' ') && b.dataset.l !== ' ' ? ' ' : '') + b.dataset.l;
          inp.focus();
        };
      } else {
        const nb = el.querySelector('[data-a=next]'); nb.focus();
        nb.onclick = () => { i++; answer = null; draw(); };
      }
    }
    draw();
    return { destroy() {} };
  },
};
