// Drone improvisation: a low open fifth in the left hand, free improvisation in the right,
// one focus at a time. The app times the session and reflects back what you played: phrases, space, rhythm, notes outside the key.
import { html, render } from '../html.js';
import { majorScale, noteLabel, parseNote, pcOf } from '../theory.js';
import { audio } from '../audio.js';
import { playAbc, stopPlayback } from './lesson.js';

export const FOCUS = {
  listen: { title: 'Listen' },
  phrases: { title: 'Phrases' },
  rhythm: { title: 'Rhythm' },
};
// Guided "moves": one concrete thing to try for about a minute each, with an example over the drone.
export const MOVES = {
  listen: [
    { title: 'Three home notes', text: 'Play only C, E and G, one long note at a time. Let each ring until it nearly fades before the next. Notice how calm they sound over the drone.', abc: 'c4 G4 | E8 | G4 c4- | c8 |]' },
    { title: 'Floating notes', text: 'Add D and A. Alternate a home note with a floating one, E then D, G then A, and listen to the colour change each time.', abc: 'E4 D4 | E8 | G4 A4 | G8 |]' },
    { title: 'Notes that pull', text: 'Now B and F. Play B and let it rise to C. Play F and let it fall to E. Hold the restless note a moment longer before it resolves.', abc: 'B6 c2- | c8 | F6 E2- | E8 |]' },
    { title: 'Choose the feeling', text: 'Any notes, slowly. Before each one, decide what you want: rest (C E G), colour (D A) or pull (B F). Play it and check you got that feeling.', abc: 'E2 D2 A4 | G8 | B4 c2 A2 | G8 |]' },
  ],
  phrases: [
    { title: 'Question and answer', text: 'Play a short phrase of 3 to 5 notes that ends on D or A: it sounds like a question. Then answer with one that ends on C or E. Breathe between them.', abc: 'z2 E F G2 A2 | D8 | z2 E D C2 E2 | C8 |]' },
    { title: 'Say it again', text: 'Play a short phrase, then repeat it exactly. The third time, change one note. Repetition makes improvising sound intentional.', abc: 'G A G E- E4 | G A G E- E4 | G A c A- A4 | z8 |]', swing: true },
    { title: 'Arches', text: 'Shape a phrase like an arch: up, then back down. Then one that only falls, and one that only climbs. Notice how the shape changes the mood.', abc: 'C D E G A G E D | C8 | c B A G F E D C | z8 |]', swing: true },
    { title: 'Short, medium, long', text: 'A 2-beat phrase, then rest. A one-bar phrase, then rest. A two-bar phrase, then rest as long as it lasted. Vary the length on purpose.', abc: 'E D C2 z4 | G A G E D2 z2 | E F G A c B A G | E8 |]', swing: true },
  ],
  rhythm: [
    { title: 'One note, many rhythms', text: 'Stay on G and play only rhythms: long notes, short-short-long, notes off the beat. Make a single note talk.', abc: 'G2 G2 G4 | z G2 G G4 | G G z G- G4 | z8 |]', swing: true },
    { title: 'Swing it', text: 'Play stepwise lines in swung eighths, long-short with the weight on the offbeat (doo-VAH), and end each line on a long note.', abc: 'C D E F G A G E | D8 | E F G A B c B G | A8 |]', swing: true },
    { title: 'Start late', text: 'Never start on beat 1: begin each phrase on beat 2, or on the “and” of 1. Starting after the beat is one of the most jazz-sounding habits there is.', abc: 'z2 E G A G E2 | z8 | z E G A c A G2 | z8 |]', swing: true },
    { title: 'Busy, then sparse', text: 'Alternate a busy phrase full of eighth notes with a sparse one of two or three long notes. Contrast keeps a solo alive.', abc: 'E F G A c B A G | E8 | z4 c4- | c4 G4 |]', swing: true },
  ],
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
    // this session's moves: spread over the focuses, starting further along each time you come back
    const nMoves = Math.max(focuses.length, Math.min(6, Math.round((cfg.min || 5) * 60 / 60)));
    const sessions = store.progress.drone || 0;
    const plan = Array.from({ length: nMoves }, (_, k) => { const f = focuses[k % focuses.length], list = MOVES[f]; return { focus: f, ...list[(Math.floor(k / focuses.length) + sessions) % list.length] }; });
    let moveIdx = 0, moveStart = 0;
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
      if (finished) { finished = false; elapsed = 0; st = fresh(); moveIdx = 0; moveStart = 0; drawMove(); }
      running = !running; lastTick = performance.now() / 1000;
      if (running) { st.silentSince = lastTick; startDrone(); if (elapsed < 1) playExample(); } else { stopDrone(); }
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
      // move on to the next idea when its share of the time is up
      const per = total / plan.length;
      if (running && moveIdx < plan.length - 1 && elapsed - moveStart >= per) nextMove(true);
      const left = el.querySelector('.mv-left');
      if (left) left.textContent = moveIdx < plan.length - 1 ? `next idea in ${Math.max(0, Math.ceil(per - (elapsed - moveStart)))} s` : 'last idea';
      const pal = el.querySelector('.palette');
      if (pal) { const max = Math.max(1, ...s.palette); pal.querySelectorAll('i').forEach((b, k) => { b.style.height = `${8 + (s.palette[k] / max) * 40}px`; }); }
      const ring = el.querySelector('.d-ring'); if (ring) ring.style.setProperty('--p', Math.min(1, elapsed / total));
    }
    function nextMove(auto) {
      if (moveIdx >= plan.length - 1) return;
      moveIdx++; moveStart = elapsed;
      drawMove();
      playExample(); // show the new idea before you try it
    }
    function playExample() {
      const m = plan[moveIdx];
      playAbc({ abc: m.abc, drone: appDrone ? null : droneMidis(), bpm: m.swing ? 104 : 76 }, { swing: !!m.swing, accent: !!m.swing, kb: ctx.kb });
    }
    function drawMove() {
      const box = el.querySelector('.move'); if (!box) return;
      const m = plan[moveIdx];
      render(box, html`
        <div class="mv-top"><span class="mv-focus">${FOCUS[m.focus].title} · idea ${moveIdx + 1} of ${plan.length}</span>
          <span class="mv-dots">${plan.map((_, k) => html`<i class="${k < moveIdx ? 'done' : k === moveIdx ? 'on' : ''}"></i>`)}</span></div>
        <h3>${m.title}</h3>
        <p>${m.text}</p>
        <div class="row"><button class="btn small" data-a="example">▶ Show me again</button>
          ${moveIdx < plan.length - 1 ? html`<button class="btn ghost small" data-a="next">Next idea →</button>` : ''}
          <span class="mv-left muted small"></span></div>`);
      box.querySelector('[data-a=example]').onclick = playExample;
      const nx = box.querySelector('[data-a=next]'); if (nx) nx.onclick = () => nextMove(false);
    }
    function draw() {
      const s = summary();
      render(el, html`
        <div class="card drill-card drone">
          <div class="drone-main">
            <div class="d-ring"><span class="d-time">${fmt(Math.max(0, total - elapsed))}</span></div>
            <div>
              <div class="move"></div>
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
      drawMove();
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
      destroy() { clearInterval(timer); stopDrone(); stopPlayback(); },
    };
  },
};
