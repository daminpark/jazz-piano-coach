// Drone improvisation (book p. 10): a low open fifth in the left hand, free improvisation in the right,
// one focus at a time. The app times the session and reflects back what you played: phrases, space, rhythm, notes outside the key.
import { html, render } from '../html.js';
import { majorScale, noteLabel, parseNote, pcOf } from '../theory.js';
import { audio } from '../audio.js';

export const FOCUS = {
  listen: { title: 'Listen', text: 'Play a note or two, then stop and let them ring against the drone. Notice how each one sits over it: settled, tense, bright, dark. Let the sound decide what comes next.' },
  phrases: { title: 'Phrases', text: 'Shape each idea like a spoken sentence, with a clear start and a clear ending. Then leave some silence before the next one.' },
  rhythm: { title: 'Rhythm', text: 'Make rhythm the subject. Build a phrase from one rhythmic idea and vary it. Mix long and short notes, repeated notes and rests.' },
};
const KEYS = ['C', 'F', 'G', 'D', 'Bb', 'Eb', 'A'];
const SPLIT = 53; // notes below F3 are the drone hand
const GAP = 1.0; // seconds of right-hand silence that end a phrase
const BUCKETS = [[0, 0.2, 'very short'], [0.2, 0.36, 'short'], [0.36, 0.7, 'medium'], [0.7, 1.4, 'long'], [1.4, GAP + 9, 'very long']];

export const drone = {
  title: 'Drone improvisation',
  mount(ctx) {
    const { el, cfg, store } = ctx;
    const focuses = (cfg.focus || ['listen']).filter(f => FOCUS[f]);
    const total = (cfg.min || 5) * 60;
    let key = store.settings.droneKey || 'C', running = false, elapsed = 0, lastTick = 0, timer = 0, droneTimer = 0, appDrone = !!store.settings.appDrone, finished = false;
    let st = fresh();
    function fresh() { return { notes: 0, phrases: 0, phraseNotes: [], lastOn: null, rhHeld: 0, silentSince: null, silent: 0, iois: [], outside: 0, outsideNames: {} }; }
    const scalePcs = () => new Set(majorScale(key).map(pcOf));
    const droneMidis = () => { const r = 36 + pcOf(parseNote(key)); const root = r > 41 ? r - 12 : r; return [root, root + 7]; }; // F♯1..F2

    function tick() {
      const now = performance.now() / 1000;
      if (running) elapsed += now - lastTick;
      lastTick = now;
      if (running && elapsed >= total && !finished) end();
      paintLive();
    }
    function toggle() {
      if (finished) { finished = false; elapsed = 0; st = fresh(); }
      running = !running; lastTick = performance.now() / 1000;
      if (running) { st.silentSince = lastTick; startDrone(); } else { stopDrone(); }
      draw();
    }
    function startDrone() {
      if (!appDrone) return;
      audio.init().then(() => {
        const hit = () => audio.chord(droneMidis(), 5.5, audio.now(), 0.32);
        hit(); clearInterval(droneTimer); droneTimer = setInterval(hit, 4200);
      });
    }
    function stopDrone() { clearInterval(droneTimer); droneTimer = 0; }
    function end() {
      running = false; finished = true; stopDrone();
      if (st.silentSince != null) st.silent += performance.now() / 1000 - st.silentSince;
      audio.init().then(() => { audio.play(84, 1.2, audio.now(), 0.25); audio.play(91, 1.6, audio.now() + 0.18, 0.2); });
      const s = summary();
      if (elapsed >= Math.min(180, total * 0.6) && s.phrases >= 3) { store.progress.drone = (store.progress.drone || 0) + 1; store.save(); }
      store.log({ drill: 'drone', key, focus: focuses, minutes: +(elapsed / 60).toFixed(1), ...s });
      ctx.done(s);
      draw();
    }
    function summary() {
      const used = BUCKETS.map(([a, b]) => st.iois.filter(x => x >= a && x < b).length);
      return {
        notes: st.notes, phrases: st.phrases,
        avgPhrase: st.phraseNotes.length ? st.phraseNotes.reduce((a, b) => a + b, 0) / st.phraseNotes.length : 0,
        space: elapsed ? Math.min(1, (st.silent + (running && st.rhHeld === 0 && st.silentSince != null ? performance.now() / 1000 - st.silentSince : 0)) / elapsed) : 0,
        rhythms: used.filter(n => n >= 3).length, palette: used, outside: st.outside,
      };
    }
    const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    function paintLive() {
      const s = summary();
      const set = (sel, v) => { const n = el.querySelector(sel); if (n) n.textContent = v; };
      set('.d-time', fmt(Math.max(0, total - elapsed)));
      set('.d-phrases', s.phrases); set('.d-avg', s.avgPhrase ? s.avgPhrase.toFixed(1) : '–');
      set('.d-space', `${Math.round(s.space * 100)}%`); set('.d-rhythm', `${s.rhythms} / 5`); set('.d-out', s.outside);
      const seg = focuses[Math.min(focuses.length - 1, Math.floor(elapsed / (total / focuses.length)))];
      const f = el.querySelector('.d-focus');
      if (f && f.dataset.f !== seg) { f.dataset.f = seg; render(f, html`<b>${FOCUS[seg].title}.</b> ${FOCUS[seg].text}`); }
      const pal = el.querySelector('.palette');
      if (pal) { const max = Math.max(1, ...s.palette); pal.querySelectorAll('i').forEach((b, k) => { b.style.height = `${8 + (s.palette[k] / max) * 40}px`; }); }
      const ring = el.querySelector('.d-ring'); if (ring) ring.style.setProperty('--p', Math.min(1, elapsed / total));
    }
    function draw() {
      const s = summary();
      render(el, html`
        <div class="card drill-card drone">
          <div class="drone-main">
            <div class="d-ring"><span class="d-time">${fmt(Math.max(0, total - elapsed))}</span></div>
            <div>
              <p class="d-focus" data-f=""></p>
              <p class="muted small">Left hand: a low open fifth (${droneMidis().map(m => ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][m % 12]).join(' + ')}), re-struck whenever it fades. Right hand: improvise using the notes of ${noteLabel(parseNote(key))} major. Pedal is fine. ${focuses.length > 1 ? `Focus changes every ${Math.round(total / focuses.length / 60)} min.` : ''}</p>
              <div class="row">
                <button class="btn primary" data-a="go">${finished ? 'Again' : running ? 'Pause' : elapsed ? 'Resume' : 'Start'} <kbd>Space</kbd></button>
                ${running || finished ? '' : html`<button class="btn ghost" data-a="end" ${elapsed > 30 ? '' : 'disabled'}>Finish now</button>`}
                <select data-a="key" ${running ? 'disabled' : ''} aria-label="Key">${KEYS.map(k => html`<option value="${k}" ${k === key ? 'selected' : ''}>${noteLabel(parseNote(k))} drone</option>`)}</select>
                <label class="check"><input type="checkbox" data-a="app" ${appDrone ? 'checked' : ''}> The app plays the drone</label>
              </div>
            </div>
          </div>
          <div class="stat-row">
            <div class="stat"><b class="d-phrases">${s.phrases}</b><span>phrases</span></div>
            <div class="stat"><b class="d-avg">–</b><span>notes per phrase</span></div>
            <div class="stat"><b class="d-space">0%</b><span>silence</span></div>
            <div class="stat"><b class="d-rhythm">0 / 5</b><span>rhythm lengths used</span></div>
            <div class="stat"><b class="d-out">0</b><span>notes outside the key</span></div>
            <div class="stat palette" title="How often you used each note length (very short to very long)">${BUCKETS.map(b => html`<i title="${b[2]}"></i>`)}<span>rhythm palette</span></div>
          </div>
          ${finished ? html`<div class="verdicts pass"><div class="verdict-title">Session ${store.progress.drone || 0} done</div>
            <div class="${s.phrases >= 3 ? 'ok' : 'warn'}">${s.phrases} phrases, about ${s.avgPhrase.toFixed(1)} notes each. ${s.space < 0.25 ? 'Not much silence: try leaving more space between ideas.' : 'Good use of space.'}</div>
            <div class="${s.rhythms >= 3 ? 'ok' : 'warn'}">${s.rhythms >= 3 ? `You used ${s.rhythms} different note lengths.` : 'Your rhythms were quite uniform. Mix long and short notes next time.'}</div>
            ${s.outside ? html`<div class="warn">${s.outside} notes outside ${noteLabel(parseNote(key))} major. Fine if on purpose!</div>` : ''}</div>` : ''}
        </div>`);
      paintLive();
      el.querySelector('[data-a=go]').onclick = toggle;
      const e = el.querySelector('[data-a=end]'); if (e) e.onclick = end;
      el.querySelector('[data-a=key]').onchange = ev => { key = ev.target.value; store.settings.droneKey = key; store.save(); draw(); };
      el.querySelector('[data-a=app]').onchange = ev => { appDrone = ev.target.checked; store.settings.appDrone = appDrone; store.save(); if (running) { if (appDrone) startDrone(); else stopDrone(); } };
    }
    timer = setInterval(tick, 250);
    draw();
    return {
      noteOn(m) {
        if (!running || m < SPLIT) return;
        const now = performance.now() / 1000;
        if (st.rhHeld === 0 && st.silentSince != null) {
          const gap = now - st.silentSince;
          st.silent += gap;
          if (st.lastOn == null || gap >= GAP) { st.phrases++; st.phraseNotes.push(0); }
          st.silentSince = null;
        }
        if (st.lastOn != null && now - st.lastOn < GAP + 9 && st.phraseNotes.length && st.phraseNotes[st.phraseNotes.length - 1] > 0) st.iois.push(now - st.lastOn);
        st.lastOn = now; st.rhHeld++; st.notes++;
        if (st.phraseNotes.length) st.phraseNotes[st.phraseNotes.length - 1]++;
        if (!scalePcs().has(m % 12)) st.outside++;
      },
      noteOff(m) {
        if (!running || m < SPLIT) return;
        st.rhHeld = Math.max(0, st.rhHeld - 1);
        if (st.rhHeld === 0) st.silentSince = performance.now() / 1000;
      },
      onSpace() { toggle(); },
      destroy() { clearInterval(timer); stopDrone(); },
    };
  },
};
