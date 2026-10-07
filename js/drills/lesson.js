// A guided lesson: one short step at a time. Each step demonstrates (sound + the keys lighting up), then it's your
// turn; the app listens and moves on by itself once you've played it. No buttons needed.
import { html, render } from '../html.js';
import { audio, Scheduler, swingGroove } from '../audio.js';
import { chord as mkChord, matchesChord, identify, heldNames, noteLabel, movement, closestVoicing } from '../theory.js';
import { parseAbc, swingNotes, drawAbc } from '../lib/abc.js';
import { Take } from '../lib/tempo.js';
import { judgeTake } from './pattern.js';
import { LESSONS } from '../content/index.js';

/** **bold** and *italic* inside lesson text */
export function fmt(s) {
  return s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map(part => (part.startsWith('**') && part.length > 4 ? html`<b>${part.slice(2, -2)}</b>`
    : part.startsWith('*') && part.endsWith('*') && part.length > 2 ? html`<i>${part.slice(1, -1)}</i>` : part));
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

const HOME = [60, 64, 67, 71]; // a comfortable hand position around middle C
const rootPos = ch => { const r = 60 + ch.pcs[0] - (ch.pcs[0] >= 7 ? 12 : 0); return ch.pcs.map(pc => r + ((pc - ch.pcs[0] + 12) % 12)); };
const SLACK = 2; // semitones over the closest possible that still count as closest

export const lesson = {
  title: 'Lesson',
  mount(ctx) {
    const { el, cfg, store, kb } = ctx;
    const L = LESSONS[cfg.lesson], steps = L.steps;
    let k = 0, phase = 'demo', task = null, timers = [], finished = false, demoText = '';
    const later = (fn, ms) => timers.push(setTimeout(fn, ms));
    const step = () => steps[k];
    const held = () => [...ctx.held()];

    // ---------- demonstrations ----------
    function runDemo(d, mine) {
      if (Array.isArray(d)) return d.reduce((p, x) => p.then(() => (mine() ? runDemo(x, mine) : null)), Promise.resolve());
      if (d.abc) return new Promise(res => playAbc(d, { kb, onEnd: res }));
      if (d.keys) return playVoicings([d.keys], [null], mine);
      // a chord sequence, each chord in the voicing closest to the one before (or root position, to compare)
      const chords = d.chords.map(([r, q]) => mkChord(r, q));
      let v = d.start && matchesChord(d.start, chords[0]) ? d.start : closestVoicing(d.start || HOME, chords[0]).voicing;
      const vs = chords.map((c, i) => (d.root ? rootPos(c) : i === 0 ? v : (v = closestVoicing(v, c).voicing)));
      return playVoicings(vs, chords, mine);
    }
    function playVoicings(vs, chords, mine) {
      return audio.init().then(() => new Promise(res => {
        const stepS = vs.length === 1 ? 1.8 : 1.15, t0 = audio.now() + 0.1;
        vs.forEach((v, i) => {
          if (vs.length === 1) v.forEach((m, j) => audio.play(m, 0.5, t0 + j * 0.2, 0.42));
          audio.chord(v, stepS * 0.95, t0 + i * stepS + (vs.length === 1 ? v.length * 0.2 : 0), 0.42);
          later(() => {
            if (!mine()) return;
            kb.clearPressed(); v.forEach(m => kb.press(m, 'neutral'));
            demoText = chords[i] ? `${chords[i].symbol}: ${heldNames(v, chords[i]).join(' ')}` : heldNames(v).join(' ');
            paintStatus();
          }, (t0 + i * stepS - audio.now()) * 1000);
        });
        later(() => { kb.clearPressed(); demoText = ''; res(); }, (0.1 + vs.length * stepS + (vs.length === 1 ? 0.8 : 0)) * 1000);
      }));
    }

    // ---------- your turn: each task listens to the piano and calls done() ----------
    function makeTask(d, done) {
      let debounce = 0;
      const settle = fn => { clearTimeout(debounce); debounce = setTimeout(fn, 120); };

      if (d.chord) {
        const [r, q] = d.chord, c = mkChord(r, q);
        let hinted = false;
        later(() => { if (!hinted && phase === 'do') { hinted = true; kb.setTargets(closestVoicing(HOME, c).voicing.map(m => ({ midi: m, hand: 'R', strength: 0.5 }))); paintStatus('Here it is: the lit keys.'); } }, 9000);
        const check = () => { if (matchesChord(held(), c)) done(); else paintStatus(); };
        return { prompt: `Play ${c.symbol}`, detail: () => hearing(c), noteOn: () => settle(check), noteOff: () => settle(check) };
      }
      if (d.hold) {
        const check = () => { const h = new Set(held()); if (d.hold.every(m => h.has(m))) done(); };
        kb.setTargets(d.hold.map(m => ({ midi: m, hand: 'L', strength: 0.5 })));
        return { prompt: `Hold ${heldNames(d.hold).join(' and ')} (lit)`, detail: () => '', noteOn: () => settle(check), noteOff: () => {} };
      }
      if (d.notes) {
        const seq = parseAbc(d.notes).notes.map(n => n.midi);
        let i = 0;
        const names = () => html`${seq.map((m, j) => html`<span class="${j < i ? 'ok' : j === i ? 'g-next' : 'muted'}">${heldNames([m])[0]}</span> `)}`;
        return {
          prompt: `Play ${seq.map(m => heldNames([m])[0]).join(', then ')}`, detail: names,
          noteOn(m) { if (m % 12 === seq[i] % 12) { kb.press(m, 'ok'); i++; paintStatus(); if (i >= seq.length) done(); } else kb.press(m, 'bad'); },
          noteOff() {},
        };
      }
      if (d.free) {
        let n = 0;
        const okPc = m => !d.pcs || d.pcs.includes(m % 12);
        return {
          prompt: `Play ${d.free} notes${d.pcs ? ` from ${heldNames(d.pcs.map(p => 60 + p)).join(', ')}` : ''}`, detail: () => html`${Array.from({ length: d.free }, (_, j) => html`<i class="g-dot ${j < n ? 'on' : ''}"></i>`)}`,
          noteOn(m) { if (m < 53) return; if (okPc(m)) { n++; kb.press(m, 'ok'); paintStatus(); if (n >= d.free) later(done, 1500); } else kb.press(m, 'bad'); },
          noteOff() {},
        };
      }
      if (d.chain) return chainTask(d, done, settle);
      if (d.timed) return timedTask(d, done);
      return null;
    }

    function chainTask(d, done, settle) {
      const chords = d.chain.map(([r, q]) => mkChord(r, q));
      let i = 0, prev = null, misses = 0, tries = 0, note = '';
      const nm = (m, c) => heldNames([m], c)[0];
      function hint() {
        if (d.hints === 0) { kb.setTargets([]); return; }
        if (i === 0) { kb.setTargets(d.start ? d.start.map(m => ({ midi: m, hand: 'R', strength: 0.5 })) : []); return; }
        const { voicing: best } = closestVoicing(prev, chords[i]);
        const A = prev.slice().sort((a, b) => a - b), B = best;
        const keep = A.filter((m, j) => m === B[j]), moves = A.map((m, j) => [m, B[j]]).filter(([a, b]) => a !== b);
        kb.setTargets([...keep.map(m => ({ midi: m, hand: 'K' })), ...(d.hints === 2 ? moves.map(([, t]) => ({ midi: t, hand: 'R', strength: 0.5 })) : [])]);
        note = d.hints === 2 ? `Keep ${keep.map(m => nm(m, chords[i - 1])).join(' ') || 'nothing'} · move ${moves.map(([a, b]) => `${nm(a, chords[i - 1])}→${nm(b, chords[i])}`).join(', ')}`
          : `Keep the green keys; move the others by a step.`;
      }
      function check() {
        const h = held();
        if (h.length < 3 || !matchesChord(h, chords[i])) return;
        const v = h.sort((a, b) => a - b);
        if (i > 0) {
          const best = closestVoicing(prev, chords[i]).cost, cost = movement(prev, v);
          if (cost > best + SLACK) { misses++; v.forEach(m => kb.press(m, 'bad')); note = `That moved ${cost} semitones; the closest moves ${best}. Keep going.`; } else v.forEach(m => kb.press(m, 'ok'));
        }
        prev = v; i++;
        if (i >= chords.length) {
          tries++;
          if (misses && tries < 2) { i = 0; misses = 0; note = 'Once more, moving as little as you can.'; prev = null; hint(); paintStatus(); return; }
          kb.setTargets([]); done(); return;
        }
        hint(); paintStatus();
      }
      hint();
      return {
        prompt: chords.map(c => c.symbol).join(' → '),
        detail: () => html`<span class="g-chain">${chords.map((c, j) => html`<b class="${j < i ? 'ok' : j === i ? 'g-next' : 'muted'}">${c.symbol}</b>`)}</span>${note ? html`<br><span class="muted small">${note}</span>` : ''}`,
        noteOn: () => settle(check), noteOff: () => settle(check),
      };
    }

    function timedTask(d, done) {
      let { notes } = parseAbc(d.timed);
      notes = swingNotes(notes);
      const beats = Math.ceil(parseAbc(d.timed).beats);
      const ex = { notes: notes.map(n => ({ beat: n.beat, midi: d.anyPitch ? 0 : n.midi, hand: 'R', off: Math.abs((n.beat % 1) - 2 / 3) < 0.01 })), beats, swing: true, legato: false };
      let take = null, played = [], verdict = null, state = 'ready';
      const bpm = d.bpm || 100;
      function start() {
        state = 'count'; played = []; verdict = null; paintStatus();
        const b = 60 / bpm, events = d.ride ? swingGroove(beats, bpm, { kick: false }) : Array.from({ length: beats }, (_, i) => i).filter(i => i % 2 === 1).map(i => ({ t: i * b, kind: 'tick', level: 0 }));
        take = new Take({ bpm, beats, events, onBeat: x => { if (x >= 0 && state === 'count') { state = 'play'; paintStatus(); } }, onEnd: judge });
        take.start();
      }
      function judge() {
        const r = judgeTake(ex, played, bpm, { minAccuracy: 0.8 });
        const s = r.stats || {};
        const need = d.need || {};
        const ok = r.accuracy >= 0.8 && (!need.swing || (s.pairs && s.inZone / s.pairs >= need.swing)) && (!need.accent || (s.pairs && s.louder / s.pairs >= need.accent));
        verdict = { ok, lines: [`${Math.round(r.accuracy * 100)}% of the notes`, ...(need.swing && s.pairs ? [`${s.inZone} of ${s.pairs} offbeats swung`] : []), ...(need.accent && s.pairs ? [`${s.louder} of ${s.pairs} offbeats louder`] : [])] };
        take = null;
        if (ok) done(); else { state = 'ready'; paintStatus(); }
      }
      return {
        prompt: 'Play along', timed: true,
        detail: () => (state === 'ready' ? html`${verdict ? html`<span class="warn">Not quite: ${verdict.lines.join(' · ')}.</span> ` : ''}<b>Play any key to start the count-in.</b>`
          : state === 'count' ? 'Count-in…' : 'Now!'),
        noteOn(m, vel, t) {
          if (state === 'ready') { start(); return; } // the first key just starts it
          if (!take || m < 48) return;
          const beat = take.beatAt(t);
          if (beat < -0.5) return;
          played.push({ midi: d.anyPitch ? 0 : m, vel, beat, hand: 'R' });
        },
        noteOff() {},
        get take() { return take; }, // for debugging
        destroy() { if (take) { take.onEnd = null; take.stop(); } },
      };
    }

    function hearing(c) {
      const h = held();
      if (!h.length) return '';
      const name = identify(h), pcs = new Set(h.map(m => m % 12));
      const missing = c.pcs.map((p, j) => (pcs.has(p) ? null : noteLabel(c.notes[j]))).filter(Boolean);
      const extra = heldNames(h.filter(m => !c.pcs.includes(m % 12)));
      const tip = missing.length === 1 && extra.length === 1 ? ` · ${c.symbol} has ${missing[0]}, not ${extra[0]}` : missing.length && !extra.length ? ` · add ${missing.join(' and ')}` : extra.length && !missing.length ? ` · ${extra.join(' and ')} isn’t in ${c.symbol}` : '';
      return `Hearing ${heldNames(h, c).join(' ')}${name ? ` (${name})` : ''}${tip}`;
    }

    // ---------- flow ----------
    function enter(i) {
      timers.forEach(clearTimeout); timers = [];
      if (task && task.destroy) task.destroy();
      task = null; stopPlayback(); kb.setTargets([]); kb.clearPressed();
      k = i; demoText = '';
      const mine = () => k === i && !finished;
      draw();
      if (step().demo) { phase = 'demo'; draw(); runDemo(step().demo, mine).then(() => { if (mine()) yourTurn(); }); } else yourTurn();
    }
    function yourTurn() {
      if (!step().do) { phase = 'ok'; draw(); later(next, 600); return; }
      phase = 'do';
      task = makeTask(step().do, succeed);
      draw();
    }
    function succeed() {
      if (phase !== 'do') return;
      phase = 'ok'; kb.setTargets([]);
      audio.init().then(() => { audio.play(84, 0.5, audio.now(), 0.18); audio.play(91, 0.8, audio.now() + 0.12, 0.15); });
      draw();
      later(next, 1100);
    }
    function next() {
      if (k + 1 < steps.length) enter(k + 1);
      else {
        finished = true; phase = 'done';
        (store.progress.lessons ||= {})[cfg.lesson] = Date.now(); store.save();
        ctx.done({ lesson: cfg.lesson });
        draw();
      }
    }
    function status() {
      if (finished) return html`<span class="ok">✓ Lesson done</span>`;
      if (phase === 'demo') return html`<span class="g-watch">Watch${demoText ? html`: <b>${demoText}</b>` : '…'}</span>`;
      if (phase === 'ok') return html`<span class="ok">✓</span>`;
      if (phase === 'do' && task) return html`<span class="g-turn">Your turn:</span> <b>${task.prompt}</b>`;
      return '';
    }
    function paintStatus(extra) {
      const s = el.querySelector('.g-status'); if (s) render(s, status());
      const d = el.querySelector('.g-detail'); if (d) render(d, extra ? html`${extra}` : task && phase === 'do' ? task.detail() : '');
    }
    function draw() {
      const st = step(), abc = st.demo && (Array.isArray(st.demo) ? st.demo.find(x => x.abc) : st.demo.abc ? st.demo : null);
      render(el, html`
        <div class="card drill-card guided">
          <div class="g-top"><span class="muted small">${L.title}</span><span class="g-dots">${steps.map((_, j) => html`<i class="${j < k || finished ? 'done' : j === k ? 'on' : ''}"></i>`)}</span></div>
          ${finished ? html`<p class="g-say">That’s the lesson. Moving on to the next step…</p>` : html`
            <p class="g-say">${fmt(st.say)}</p>
            ${abc && !(st.do && st.do.timed) ? html`<div class="abc-host g-abc"></div>` : st.do && st.do.timed ? html`<div class="abc-host g-abc"></div>` : ''}
            <div class="g-status"></div>
            <div class="g-detail"></div>
            <div class="g-links">
              ${st.demo ? html`<button class="linkish small" data-a="again">↻ Show me again</button>` : ''}
              ${st.more ? html`<details class="g-more"><summary>Hint</summary>${st.more}</details>` : ''}
              <button class="linkish small" data-a="skip">Skip this step ›</button>
            </div>`}
        </div>`);
      const host = el.querySelector('.g-abc');
      if (host) drawAbc(host, (st.do && st.do.timed) || abc.abc);
      paintStatus();
      const ag = el.querySelector('[data-a=again]'); if (ag) ag.onclick = () => enter(k);
      const sk = el.querySelector('[data-a=skip]'); if (sk) sk.onclick = next;
    }

    enter(0);
    return {
      noteOn(m, vel, t) { if (phase === 'do' && task) task.noteOn(m, vel, t); },
      noteOff(m, t) { if (phase === 'do' && task) task.noteOff(m, t); },
      busy: () => !!(task && task.timed && phase === 'do'),
      get take() { return task && task.take; }, // for debugging
      destroy() { timers.forEach(clearTimeout); if (task && task.destroy) task.destroy(); stopPlayback(); kb.setTargets([]); },
    };
  },
};
