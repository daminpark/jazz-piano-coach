// A lesson: text, notation you can hear, keyboard diagrams, and "play it now" checks that listen to your piano.
import { html, render } from '../html.js';
import { audio, Scheduler, swingGroove } from '../audio.js';
import { chord as mkChord, matchesChord, midiName } from '../theory.js';
import { parseAbc, swingNotes, drawAbc } from '../lib/abc.js';
import { LESSONS } from '../content/index.js';

/** **bold** and *italic* inside lesson text */
export function fmt(s) {
  return s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map(part => (part.startsWith('**') && part.length > 4 ? html`<b>${part.slice(2, -2)}</b>`
    : part.startsWith('*') && part.endsWith('*') && part.length > 2 ? html`<i>${part.slice(1, -1)}</i>` : part));
}

const WHITE = new Set([0, 2, 4, 5, 7, 9, 11]);
/** a small two-octave keyboard with some keys marked */
function miniKeys(notes) {
  const lo = Math.min(...notes) - (Math.min(...notes) % 12), hi = Math.max(lo + 23, Math.max(...notes) + (11 - (Math.max(...notes) % 12)));
  const whites = []; for (let m = lo; m <= hi; m++) if (WHITE.has(m % 12)) whites.push(m);
  const W = 22, H = 80, x = m => whites.indexOf(m) * W;
  const on = new Set(notes);
  const bx = m => x(m - 1) + W - 7;
  return html`<svg class="mini-kb" viewBox="0 0 ${whites.length * W} ${H + 2}">
    ${whites.map(m => html`<rect x="${x(m) + 0.5}" y="1" width="${W - 1}" height="${H}" rx="2" class="mk-w ${on.has(m) ? 'on' : ''}"></rect>
      ${on.has(m) ? html`<text x="${x(m) + W / 2}" y="${H - 8}" class="mk-t">${midiName(m).replace(/\d+$/, '')}</text>` : ''}`)}
    ${Array.from({ length: hi - lo + 1 }, (_, k) => lo + k).filter(m => !WHITE.has(m % 12)).map(m => html`<rect x="${bx(m)}" y="1" width="14" height="${H * 0.6}" rx="2" class="mk-b ${on.has(m) ? 'on' : ''}"></rect>
      ${on.has(m) ? html`<text x="${bx(m) + 7}" y="${H * 0.6 - 6}" class="mk-t light">${midiName(m).replace(/\d+$/, '')}</text>` : ''}`)}
  </svg>`;
}

let playing = null;
export async function playAbc(block, { swing = !!block.swing, accent = !!block.accent } = {}) {
  await audio.init();
  if (playing) playing.stop();
  audio.stopAll();
  const bpm = block.bpm || 112, b = 60 / bpm;
  let { notes, beats } = parseAbc(block.abc);
  if (swing) notes = swingNotes(notes);
  const ev = notes.map(n => {
    const frac = n.beat - Math.floor(n.beat + 1e-6);
    const off = frac > 0.3;
    return { t: n.beat * b, kind: 'note', midi: n.midi, dur: n.dur * b * 0.98, vel: accent ? (off ? 0.56 : 0.36) : 0.44 };
  });
  if (block.drone) for (let t = 0; t < beats; t += 4) ev.push({ t: t * b, kind: 'chord', midis: block.drone, dur: 4 * b + 0.5, vel: 0.3 });
  if (block.ride) ev.push(...swingGroove(Math.ceil(beats), bpm, { kick: false }));
  playing = new Scheduler(ev, audio.now() + 0.08).start();
  const p = playing; setTimeout(() => { if (playing === p) { p.stop(); playing = null; } }, (beats * b + 2) * 1000);
}
export function stopPlayback() { if (playing) { playing.stop(); playing = null; } audio.stopAll(); }

export const lesson = {
  title: 'Lesson',
  mount(ctx) {
    const { el, cfg, store, kb } = ctx;
    const L = LESSONS[cfg.lesson];
    const R = () => (store.progress.lessons ||= {});
    const tries = []; // {id, chord, done}
    L.blocks.forEach((b, i) => { if (b.try) b.try.chords.forEach(([r, q], k) => tries.push({ id: `${i}:${k}`, chord: mkChord(r, q), done: false })); });
    const block = (b, i) => {
      if (b.h) return html`<h3>${b.h}</h3>`;
      if (b.p) return html`<p>${fmt(b.p)}</p>`;
      if (b.tip) return html`<div class="tip">${fmt(b.tip)}</div>`;
      if (b.list) return html`<ul>${b.list.map(x => html`<li>${fmt(x)}</li>`)}</ul>`;
      if (b.table) return html`<div class="tbl-wrap"><table class="ltable"><tr>${b.table.head.map(h => html`<th>${h}</th>`)}</tr>${b.table.rows.map(r => html`<tr>${r.map(c => html`<td>${c}</td>`)}</tr>`)}</table></div>`;
      if (b.keys) return html`<figure class="kfig">${miniKeys(b.keys)}<figcaption><b>${b.label}</b> <button class="btn ghost small" data-keys="${i}">▶ Hear it</button></figcaption></figure>`;
      if (b.abc) {
        const btns = b.compare === 'swing' ? html`<button class="btn small" data-play="${i}" data-swing="0" data-accent="0">▶ Straight</button><button class="btn small primary" data-play="${i}" data-swing="1" data-accent="1">▶ Swung</button>`
          : b.compare === 'accent' ? html`<button class="btn small" data-play="${i}" data-swing="1" data-accent="0">▶ Even</button><button class="btn small primary" data-play="${i}" data-swing="1" data-accent="1">▶ doo-VAH</button>`
            : html`<button class="btn small primary" data-play="${i}">▶ Play</button>`;
        return html`<figure class="abc-fig"><div class="abc-host" data-abc="${i}"></div><figcaption>${btns}<span>${b.caption ? fmt(b.caption) : ''}</span></figcaption></figure>`;
      }
      if (b.try) return html`<div class="try"><b>Play it now:</b> ${b.try.chords.map((_, k) => { const t = tries.find(x => x.id === `${i}:${k}`); return html`<span class="try-chip ${t.done ? 'ok' : ''}" data-try="${t.id}">${t.done ? '✓ ' : ''}${t.chord.symbol}</span>`; })}<span class="muted small">any inversion</span></div>`;
      return '';
    };
    function draw() {
      const done = !!R()[cfg.lesson];
      render(el, html`
        <article class="card drill-card lesson">
          ${L.blocks.map(block)}
          <label class="check big done-check"><input type="checkbox" ${done ? 'checked' : ''}> Got it</label>
        </article>`);
      el.querySelectorAll('[data-abc]').forEach(host => drawAbc(host, L.blocks[+host.dataset.abc].abc));
      el.querySelectorAll('[data-play]').forEach(btn => {
        btn.onclick = () => { const b = L.blocks[+btn.dataset.play]; playAbc(b, btn.dataset.swing != null ? { swing: btn.dataset.swing === '1', accent: btn.dataset.accent === '1' } : {}); };
      });
      el.querySelectorAll('[data-keys]').forEach(btn => {
        btn.onclick = async () => {
          await audio.init();
          const ns = L.blocks[+btn.dataset.keys].keys, t = audio.now() + 0.05;
          ns.forEach((m, k) => audio.play(m, 0.5, t + k * 0.22, 0.45));
          audio.chord(ns, 1.6, t + ns.length * 0.22 + 0.15, 0.4);
          kb.setTargets(ns.map(m => ({ midi: m, hand: 'R' })));
        };
      });
      el.querySelector('.done-check input').onchange = e => {
        if (e.target.checked) { R()[cfg.lesson] = Date.now(); ctx.done({ lesson: cfg.lesson }); } else delete R()[cfg.lesson];
        store.save();
      };
    }
    function check() {
      const held = [...ctx.held()];
      const hit = tries.find(t => !t.done && matchesChord(held, t.chord));
      if (!hit) return;
      hit.done = true;
      for (const m of held) kb.press(m, 'ok');
      const chip = el.querySelector(`[data-try="${hit.id}"]`);
      if (chip) { chip.classList.add('ok'); chip.textContent = `✓ ${hit.chord.symbol}`; }
    }
    let timer = 0;
    draw();
    return {
      noteOn() { clearTimeout(timer); timer = setTimeout(check, 120); },
      noteOff() {},
      destroy() { clearTimeout(timer); stopPlayback(); kb.setTargets([]); },
    };
  },
};
