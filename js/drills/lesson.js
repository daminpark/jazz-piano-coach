// A lesson: text, notation you can hear, keyboard diagrams, and "play it now" checks that listen to your piano.
import { html, render } from '../html.js';
import { audio, Scheduler, swingGroove } from '../audio.js';
import { chord as mkChord, matchesChord, midiName, identify, heldNames, noteLabel } from '../theory.js';
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
let lit = []; // keyboard highlights scheduled for the current example
/** play an ABC example; with kb, the keys light up as the notes sound (a demonstration, not just audio) */
export async function playAbc(block, { swing = !!block.swing, accent = !!block.accent, kb = null, onEnd = null } = {}) {
  await audio.init();
  if (playing) playing.stop();
  audio.stopAll();
  lit.forEach(clearTimeout); lit = [];
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
  const t0 = audio.now() + 0.08;
  playing = new Scheduler(ev, t0).start();
  if (kb) {
    const lead = (t0 - audio.now()) * 1000 + (audio.ctx.outputLatency || 0) * 1000;
    for (const n of notes) {
      lit.push(setTimeout(() => kb.press(n.midi, 'neutral'), lead + n.beat * b * 1000));
      lit.push(setTimeout(() => kb.release(n.midi), lead + (n.beat + n.dur) * b * 1000 - 30));
    }
  }
  const p = playing;
  lit.push(setTimeout(() => { if (playing === p) { p.stop(); playing = null; } if (onEnd) onEnd(); }, (beats * b + 1) * 1000));
}
export function stopPlayback() { if (playing) { playing.stop(); playing = null; } lit.forEach(clearTimeout); lit = []; audio.stopAll(); }

export const lesson = {
  title: 'Lesson',
  mount(ctx) {
    const { el, cfg, store, kb } = ctx;
    const L = LESSONS[cfg.lesson];
    const R = () => (store.progress.lessons ||= {});
    const tries = []; // {id, chord, done}
    // [root, quality, inversion?]: with an inversion, that chord tone must be the lowest note (shown as a slash chord)
    L.blocks.forEach((b, i) => { if (b.try) b.try.chords.forEach(([r, q, inv], k) => {
      const c = mkChord(r, q);
      tries.push({ id: `${i}:${k}`, chord: inv == null ? c : { ...c, inv, symbol: `${c.symbol}/${noteLabel(c.notes[inv])}` }, done: false });
    }); });
    const fits = (held, c) => matchesChord(held, c) && (c.inv == null || Math.min(...held) % 12 === c.pcs[c.inv]);
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
      if (b.try) return html`<div class="try" data-block="${i}"><div class="try-row"><b>Play it now:</b> ${b.try.chords.map((_, k) => { const t = tries.find(x => x.id === `${i}:${k}`); return html`<span class="try-chip ${t.done ? 'ok' : ''}" data-try="${t.id}">${t.done ? '✓ ' : ''}${t.chord.symbol}</span>`; })}<span class="muted small">any inversion</span></div>
        <div class="try-hear muted small">Play one of these chords and hold it.</div></div>`;
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
        btn.onclick = () => { const b = L.blocks[+btn.dataset.play]; playAbc(b, btn.dataset.swing != null ? { swing: btn.dataset.swing === '1', accent: btn.dataset.accent === '1', kb } : { kb }); };
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
      const hit = tries.find(t => !t.done && fits(held, t.chord));
      if (!hit) return;
      hit.done = true;
      for (const m of held) kb.press(m, 'ok');
      const chip = el.querySelector(`[data-try="${hit.id}"]`);
      if (chip) { chip.classList.add('ok'); chip.textContent = `✓ ${hit.chord.symbol}`; }
    }
    // what the app hears right now, and how it differs from the nearest chord still to play
    function hear() {
      const held = [...ctx.held()];
      el.querySelectorAll('.try').forEach(box => {
        const line = box.querySelector('.try-hear');
        const open = tries.filter(t => !t.done && t.id.startsWith(`${box.dataset.block}:`));
        if (!held.length) { line.textContent = open.length ? 'Play one of these chords and hold it.' : 'All done.'; return; }
        const exact = tries.find(t => t.id.startsWith(`${box.dataset.block}:`) && fits(held, t.chord));
        if (exact) { render(line, html`Hearing: <b>${heldNames(held, exact.chord).join(' ')}</b> (${exact.chord.symbol}) <span class="ok">✓</span>`); return; }
        const pcs = new Set(held.map(m => m % 12));
        const near = open.slice().sort((a, b) => b.chord.pcs.filter(p => pcs.has(p)).length - a.chord.pcs.filter(p => pcs.has(p)).length)[0];
        const name = identify(held);
        let hint = '';
        if (near) {
          const missing = near.chord.pcs.map((p, k) => (pcs.has(p) ? null : noteLabel(near.chord.notes[k]))).filter(Boolean);
          const extra = heldNames(held.filter(m => !near.chord.pcs.includes(m % 12)));
          if (!missing.length && !extra.length && near.chord.inv != null) hint = `Right notes: now put ${noteLabel(near.chord.notes[near.chord.inv])} at the bottom.`;
          else if (missing.length === 1 && extra.length === 1) hint = `${near.chord.symbol} has ${missing[0]}, not ${extra[0]}.`;
          else if (missing.length && !extra.length) hint = `For ${near.chord.symbol}, add ${missing.join(' and ')}.`;
          else if (!missing.length && extra.length) hint = `${extra.join(' and ')} ${extra.length > 1 ? 'aren’t' : 'isn’t'} in ${near.chord.symbol}.`;
        }
        render(line, html`Hearing: <b>${heldNames(held, near && near.chord).join(' ')}</b>${name ? html` (${name})` : ''}${hint ? html` · ${hint}` : ''}`);
      });
    }
    let timer = 0;
    draw();
    return {
      noteOn() { hear(); clearTimeout(timer); timer = setTimeout(() => { check(); hear(); }, 120); },
      noteOff() { hear(); },
      destroy() { clearTimeout(timer); stopPlayback(); kb.setTargets([]); },
    };
  },
};
