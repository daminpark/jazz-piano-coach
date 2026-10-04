// Jazz Piano Coach: daily 30-minute practice built around Jeremy Siskind's "Jazz Piano Fundamentals".
// Views: Today (the day's steps), Path (units, days, gates), Practice (one drill + keyboard), Progress, Settings.
import { html, render } from './html.js';
import { store } from './store.js';
import { midi } from './midi.js';
import { audio } from './audio.js';
import { Keyboard, noteName } from './keyboard.js';
import { UNITS, BOOK, TRACKS, allDays, dayAt, gateStatus, minutesOf, cardTime, coordPassed } from './curriculum.js';
import { DRILLS, USES_KEYS } from './drills/index.js';
import { FOCUS } from './drills/drone.js';
import { LESSONS } from './content/index.js';
import { TECH, setLabel } from './drills/technique.js';
import { deck, KEYS_FOURTHS, noteLabel, parseNote } from './theory.js';
import { initFeedback } from './feedback.js';

const $ = s => document.querySelector(s);
const P = () => store.progress;
const ALL3 = ['maj7', '7', 'm7'];
const UPCOMING = [
  [2, 'Comping Basics', 23], [3, 'Introducing the ii-V-I', 35], [4, 'Going Deeper with the ii-V-I', 51], [5, '“Evening in Lyon”', 61],
  [6, 'Type A and B Voicings', 81], [7, 'The Blues Form', 101], [8, 'Playing Bass in Two', 113], [9, '“Blues for Sammie”', 133],
  [10, 'Introducing Altered Dominants', 153], [11, 'More Altered Dominants', 167], [12, 'Improvising with Altered Dominants', 181],
];

// ---------------- theme ----------------
function applyTheme() { const t = store.settings.theme; if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }
applyTheme();

// ---------------- day bookkeeping ----------------
const dayRec = n => (P().days[n] ||= { steps: {}, done: null });
const stepDone = (n, i) => !!(P().days[n] && P().days[n].steps[i]);
const dayComplete = (n, day) => day.steps.every((_, i) => stepDone(n, i));
function markStep(n, i, result) {
  const rec = dayRec(n);
  if (!rec.steps[i]) rec.steps[i] = { at: Date.now(), result: result || null };
  const day = dayAt(n, P());
  if (!rec.done && dayComplete(n, day)) {
    rec.done = store.today();
    if (P().day === n) P().day = n + 1;
  }
  store.save();
}
function describe(st) {
  const len = { 8: '2 bars', 4: '1 bar', 2: '2 beats', 1: '1 beat' };
  switch (st.drill) {
    case 'lesson': return { title: LESSONS[st.lesson].title, sub: 'Lesson' };
    case 'drone': return { title: 'Drone improvisation', sub: `guided ideas: ${(st.focus || []).map(f => FOCUS[f].title.toLowerCase()).join(', ')}` };
    case 'technique': return { title: TECH[st.ex].title, sub: `${st.qualities.length > 1 ? 'maj7, 7 and m7' : st.qualities[0] === '7' ? 'dominant 7' : st.qualities[0]} · from ♩ = ${st.tempo}` };
    case 'chords': return { title: st.label || 'Chord flash cards', sub: `${st.count} cards · ${st.qualities.map(q => (q === '7' ? 'dom7' : q)).join(', ')}${st.test ? ' · timed test' : ''}` };
    case 'spell': return { title: 'Spell the chords', sub: `${st.count} chords, written` };
    case 'vamp': return { title: 'Vamp', sub: `4 chords, ${len[st.beatsPerChord]} each · ♩ = ${st.tempo}` };
    case 'coord': return { title: `Coordination Exercise 1, part ${st.part}`, sub: `${st.keys === 'unpassed' ? 'keys not yet passed' : st.keys.map(k => noteLabel(parseNote(k))).join(', ')} · from ♩ = ${st.tempo}` };
    case 'swing': return { title: 'Swing check', sub: `${Array.isArray(st.exercises) ? `Swing Exercise${st.exercises.length > 1 ? 's' : ''} ${st.exercises.join(' and ')}` : 'any swing exercise'} · ♩ = ${st.tempo}` };
    case 'listen': return { title: `Listen: ${TRACKS[st.track].title}`, sub: st.quiz ? 'follow the form + quiz' : 'follow the form' };
    default: return { title: st.drill, sub: '' };
  }
}
const ICON = { lesson: '📖', technique: '⚙', drone: '〰', chords: '♯', spell: '✎', vamp: '↻', coord: '⇅', swing: '♪', listen: '🎧' };

// ---------------- keyboard + MIDI ----------------
const kb = new Keyboard($('#kbWrap'), { onPress: (m, v) => midi.virtual('noteon', m, v), onRelease: m => midi.virtual('noteoff', m) });
kb.scrollTo(48, 84);
let lastActivity = 0;
midi.addEventListener('noteon', e => {
  const { midi: m, vel, time, source } = e.detail;
  lastActivity = performance.now();
  if (source === 'screen' || store.settings.echo) audio.init().then(() => audio.attack(m, vel / 127));
  kb.press(m, 'neutral');
  if (S.inst && S.inst.noteOn) S.inst.noteOn(m, vel, time);
  const t = $('#midiTest'); if (t) t.textContent = `${noteName(m)} · velocity ${vel}`;
});
midi.addEventListener('noteoff', e => {
  const { midi: m, time } = e.detail;
  if (audio.piano) audio.releaseNote(m);
  kb.release(m);
  if (S.inst && S.inst.noteOff) S.inst.noteOff(m, time);
});
midi.addEventListener('status', updateMidiPill);
function updateMidiPill() {
  $('#midiDot').className = 'dot ' + (midi.connected ? 'on' : midi.error ? 'err' : '');
  $('#midiLabel').textContent = midi.connected ? midi.label : midi.error ? 'No MIDI' : 'No keyboard';
  if (view() === 'settings') renderSettings();
}

// ---------------- practice runner ----------------
const S = { n: null, i: null, cfg: null, free: null, inst: null, sec: 0, doneNow: false };
function openStep(n, i) { location.hash = `#practice/${n}/${i}`; }
function mountPractice() {
  const parts = location.hash.split('/');
  if (S.inst) { S.inst.destroy(); S.inst = null; }
  kb.setTargets([]); kb.clearPressed();
  if (parts[1] === 'free') { S.n = S.i = null; S.free = parts[2]; S.cfg = S.free.startsWith('lesson:') ? { drill: 'lesson', min: 5, lesson: S.free.slice(7) } : FREE[S.free]?.cfg; }
  if (S.cfg && S.cfg.drill === 'lesson' && !LESSONS[S.cfg.lesson]) S.cfg = null;
  else if (parts[1]) { S.n = +parts[1]; S.i = +parts[2] || 0; S.free = null; S.cfg = dayAt(S.n, P()).steps[S.i]; }
  else { S.n = S.i = S.free = S.cfg = null; }
  S.sec = 0; S.doneNow = false;
  renderPracticeHead();
  const drillEl = $('#drill');
  $('#kbWrap').hidden = !S.cfg || !USES_KEYS.has(S.cfg.drill);
  if (!S.cfg) { renderFreeMenu(drillEl); return; }
  const def = DRILLS[S.cfg.drill];
  const ctx = {
    el: drillEl, cfg: S.cfg, store, kb, held: () => midi.active,
    done: result => { if (S.n != null) { markStep(S.n, S.i, result); S.doneNow = true; renderPracticeHead(); } },
    restart: () => mountPractice(),
  };
  S.inst = def.mount(ctx);
}
function renderPracticeHead() {
  const head = $('#pHead'), foot = $('#pFoot');
  render(foot, '');
  if (!S.cfg) { render(head, html`<div class="p-title"><h2>Practice</h2><span class="muted">Pick any drill. Your daily plan is on <a href="#today">Today</a>.</span></div>`); return; }
  const d = describe(S.cfg);
  if (S.free) {
    render(head, html`<div class="p-title"><a class="back" href="#practice">← All drills</a><h2>${d.title}</h2><span class="muted">${d.sub}</span></div>`);
    return;
  }
  const day = dayAt(S.n, P());
  const done = stepDone(S.n, S.i), last = S.i === day.steps.length - 1;
  render(head, html`
    <div class="p-title">
      <a class="back" href="#today">← Day ${S.n}</a>
      <h2>${d.title}</h2><span class="muted">${d.sub}</span>
      <span class="p-time" title="Time on this step"><b id="stepClock">${clock(S.sec)}</b> / ${S.cfg.min}:00</span>
    </div>
    <div class="p-steps">${day.steps.map((st, k) => html`<a href="#practice/${S.n}/${k}" class="pstep ${k === S.i ? 'on' : ''} ${stepDone(S.n, k) ? 'done' : ''}" title="${describe(st).title}">${stepDone(S.n, k) ? '✓' : k + 1}</a>`)}
      <span class="grow"></span>
      ${done ? html`<span class="ok small">${S.doneNow ? 'Step complete!' : 'Done'}</span>` : html`<button class="btn ghost small" data-a="mark">Mark done</button>`}
      ${last ? html`<a class="btn ${done ? 'primary' : ''}" href="#today">Finish day</a>` : html`<a class="btn ${done ? 'primary' : ''}" href="#practice/${S.n}/${S.i + 1}">Next step →</a>`}
    </div>
    ${S.cfg.note && !['coord', 'vamp', 'listen'].includes(S.cfg.drill) ? html`<p class="p-note">${S.cfg.note}</p>` : ''}`);
  // the same controls again under the drill, so you don't have to scroll back up
  render(foot, html`<div class="p-foot-row">
    <span class="muted small">Step ${S.i + 1} of ${day.steps.length}${S.i + 1 < day.steps.length ? html` · next: ${describe(day.steps[S.i + 1]).title}` : ''}</span>
    <span class="grow"></span>
    ${done ? html`<span class="ok small">${S.doneNow ? 'Step complete!' : 'Done'}</span>` : html`<button class="btn ghost small" data-a="mark">Mark done</button>`}
    ${last ? html`<a class="btn ${done ? 'primary' : ''}" href="#today">Finish day</a>` : html`<a class="btn ${done ? 'primary' : ''}" href="#practice/${S.n}/${S.i + 1}">Next step →</a>`}
  </div>`);
  for (const mk of document.querySelectorAll('#pHead [data-a=mark], #pFoot [data-a=mark]')) mk.onclick = () => { markStep(S.n, S.i, { manual: true }); renderPracticeHead(); };
}
const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const FREE = {
  chords: { cfg: { drill: 'chords', min: 8, qualities: ALL3, count: 36, label: 'All 36 seventh chords' }, about: 'maj7, 7 and m7 in all 12 keys' },
  slow: { cfg: { drill: 'chords', min: 6, qualities: ALL3, count: 20, slowestFirst: true, label: 'Your slowest chords' }, about: 'the 20 chords you find slowest' },
  test: { cfg: { drill: 'chords', min: 8, qualities: ALL3, count: 36, test: true, label: 'Chord test, timed' }, about: 'all 36, with the gate grid' },
  spell: { cfg: { drill: 'spell', min: 5, qualities: ALL3, count: 12 }, about: 'write the notes of 12 chords' },
  arp: { cfg: { drill: 'technique', min: 6, ex: 'arp', qualities: ALL3, tempo: 80, label: 'Seventh-chord arpeggios' }, about: 'maj7, 7 and m7 on each root, swung' },
  p1235: { cfg: { drill: 'technique', min: 5, ex: 'p1235', qualities: ['7'], tempo: 90, label: '1-2-3-5 patterns' }, about: 'the 1-2-3-5 shape through all keys' },
  inv: { cfg: { drill: 'technique', min: 5, ex: 'inv', qualities: ['m7'], tempo: 80, label: 'Inversions' }, about: 'block chords up and down the inversions' },
  coord1: { cfg: { drill: 'coord', min: 8, keys: KEYS_FOURTHS, part: 1, tempo: 80 }, about: 'part 1, triplets, any key' },
  coord2: { cfg: { drill: 'coord', min: 8, keys: KEYS_FOURTHS, part: 2, tempo: 100 }, about: 'part 2, swung eighths, any key' },
  swing: { cfg: { drill: 'swing', min: 5, exercises: 'any', tempo: 100 }, about: 'Swing Exercises A–E or free play, measured' },
  vamp: { cfg: { drill: 'vamp', min: 6, qualities: ALL3, beatsPerChord: 4, tempo: 100 }, about: 'comp 4 chords over bass and drums' },
  drone: { cfg: { drill: 'drone', min: 5, focus: ['listen', 'phrases', 'rhythm'] }, about: 'improvise over a low fifth' },
  freddie: { cfg: { drill: 'listen', min: 10, track: 'freddie', quiz: false }, about: 'follow the form, take the quiz' },
};
function renderFreeMenu(el) {
  render(el, html`<h3 class="menu-h">Drills</h3><div class="free-grid">${Object.entries(FREE).map(([k, f]) => html`
    <a class="card free" href="#practice/free/${k}"><span class="ficon">${ICON[f.cfg.drill]}</span><b>${f.cfg.label || DRILLS[f.cfg.drill].title}${k.startsWith('coord') ? `, part ${f.cfg.part}` : ''}</b><span class="muted small">${f.about}</span></a>`)}</div>
    <h3 class="menu-h">Lessons</h3>
    <ol class="lesson-list">${Object.entries(LESSONS).map(([id, l]) => html`<li><a href="#practice/free/lesson:${id}">${l.title}</a>${P().lessons?.[id] ? html` <span class="ok small">✓</span>` : ''}</li>`)}</ol>`);
}

// time on task: counts while practising (page visible, played or clicked in the last 2 minutes)
let pendingSec = 0;
document.addEventListener('pointerdown', () => { lastActivity = performance.now(); });
setInterval(() => {
  if (document.visibilityState !== 'visible' || view() !== 'practice' || !S.cfg) return;
  if (performance.now() - lastActivity > 120000) return;
  S.sec++; pendingSec++;
  const c = $('#stepClock'); if (c) c.textContent = clock(S.sec);
  if (pendingSec >= 10) { store.addMinutes(pendingSec); pendingSec = 0; }
}, 1000);
addEventListener('pagehide', () => { if (pendingSec) store.addMinutes(pendingSec); pendingSec = 0; });

// ---------------- Today ----------------
function renderToday() {
  const n = P().day, day = dayAt(n, P());
  const unit = day.unit, gates = gateStatus(unit, P());
  const doneSteps = day.steps.filter((_, i) => stepDone(n, i)).length;
  const firstOpen = day.steps.findIndex((_, i) => !stepDone(n, i));
  const prev = n > 1 ? P().days[n - 1] : null;
  const todayMin = Math.round(P().minutes[store.today()] || 0);
  render($('#view-today'), html`
    ${prev && prev.done === store.today() ? html`<div class="banner ok">✓ Day ${n - 1} complete today. Nice work. Day ${n} is below whenever you’re ready, today or tomorrow.</div>` : ''}
    ${!midi.connected ? html`<div class="banner">${midi.error ? midi.error : 'Connect your digital piano by USB or Bluetooth MIDI. The drills listen to what you play.'} <a href="#settings">MIDI settings</a></div>` : ''}
    <div class="hero card">
      <div class="hero-main">
        <div class="eyebrow">Unit ${unit.id} · ${unit.title} · Day ${day.inUnit}${day.catchUp || day.review ? '' : ` of ${unit.days.length}`}</div>
        <h1>${day.title}</h1>
        <p class="muted">${minutesOf(day)} minutes · ${day.steps.length} steps · ${doneSteps ? `${doneSteps} done` : 'not started'}${day.catchUp ? ' · aimed at the gates you haven’t passed yet' : ''}${day.review ? ' · all Unit 1 gates passed! Unit 2 isn’t built yet, ask Claude to add it.' : ''}</p>
        ${firstOpen >= 0 ? html`<button class="btn primary big" data-step="${firstOpen}">${doneSteps ? 'Continue' : 'Start'}: ${describe(day.steps[firstOpen]).title}</button>` : html`<div class="ok">✓ All steps done</div>`}
      </div>
      <div class="hero-side">
        <div class="ring" style="--p:${doneSteps / day.steps.length}"><b>${doneSteps}/${day.steps.length}</b></div>
        <div class="mini"><b>${todayMin}</b> min today</div>
        <div class="mini"><b>${store.streak()}</b> day streak</div>
      </div>
    </div>
    <ol class="steps">${day.steps.map((st, i) => { const d = describe(st); return html`
      <li class="step ${stepDone(n, i) ? 'done' : ''}" data-step="${i}" tabindex="0">
        <span class="sicon">${stepDone(n, i) ? '✓' : ICON[st.drill]}</span>
        <span class="stext"><b>${d.title}</b><span class="muted">${d.sub}</span>${st.note ? html`<span class="snote">${st.note}</span>` : ''}</span>
        <span class="smin">${st.min} min</span>
      </li>`; })}</ol>
    <div class="card gates">
      <h3>Unit ${unit.id} gates <span class="muted small">pass these to finish the unit</span></h3>
      ${gateList(gates)}
    </div>`);
  $('#view-today').querySelectorAll('[data-step]').forEach(b => {
    b.onclick = () => openStep(n, +b.dataset.step);
    b.onkeydown = e => { if (e.key === 'Enter') openStep(n, +b.dataset.step); };
  });
}
function gateList(gates) {
  return html`<ul class="gate-list">${gates.map(g => html`<li class="${g.passed ? 'passed' : ''}">
    <span class="gmark">${g.passed ? '✓' : ''}</span><span class="glabel">${g.label}</span>
    <span class="gbar"><i style="width:${Math.round((g.done / g.of) * 100)}%"></i></span><span class="gnum">${g.done}/${g.of}</span></li>`)}</ul>`;
}

// ---------------- Path ----------------
function renderPath() {
  const days = allDays(), cur = P().day;
  render($('#view-path'), html`
    <div class="page-head"><h1>The path</h1><p class="muted">About 30 minutes a day: a short lesson, then drills that listen to your piano. Each unit ends with gates that test you’re ready to move on. New units get added a few days at a time.</p></div>
    ${UNITS.map(u => html`<div class="card unit">
      <div class="unit-head"><span class="unum">${u.id}</span><div><h2>${u.title}</h2><span class="muted">${u.about}</span></div></div>
      <ol class="day-list">${days.filter(d => d.unit === u).map(d => { const done = P().days[d.index]?.done; return html`
        <li class="${done ? 'done' : ''} ${d.index === cur ? 'cur' : ''}"><a href="#practice/${d.index}/0">
          <span class="dnum">${done ? '✓' : d.index}</span><span><b>${d.title}</b><span class="muted small"> ${d.steps.map(s => describe(s).title).join(' · ')}</span></span>
          <span class="muted small">${done || (d.index === cur ? 'today' : '')}</span></a></li>`; })}
        ${cur > days.length ? html`<li class="cur"><a href="#today"><span class="dnum">${cur}</span><span><b>${dayAt(cur, P()).title}</b></span><span class="muted small">today</span></a></li>` : ''}
      </ol>
      <h3>Gates</h3>${gateList(gateStatus(u, P()))}
    </div>`)}
    ${UPCOMING.map(([id, title, page]) => html`<div class="card unit later"><div class="unit-head"><span class="unum">${id}</span><div><h2>${title}</h2><span class="muted">coming soon</span></div></div></div>`)}`);
}

// ---------------- Progress ----------------
function renderProgress() {
  const p = P();
  const cards = deck(ALL3);
  const byQ = q => cards.filter(c => c.quality === q);
  const tcls = t => (t < 3000 ? 'ok' : t < 6000 ? 'mid' : t < Infinity ? 'slow' : '');
  const days14 = Array.from({ length: 14 }, (_, k) => { const d = new Date(); d.setDate(d.getDate() - 13 + k); const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; return { key, d, m: p.minutes[key] || 0 }; });
  const coordCell = (k, part) => { const s = p.keys.coord1?.[k]?.[`p${part}`]; return html`<td class="${s?.passed ? 'ok' : s?.tries ? 'mid' : ''}" title="${s?.best ? `best ${Math.round(s.best.accuracy * 100)}% at ♩ ${s.best.bpm}` : 'not tried'}">${s?.passed ? '✓' : s?.best ? `${Math.round(s.best.accuracy * 100)}%` : '·'}${s?.best ? html`<small>♩${s.best.bpm}</small>` : ''}</td>`; };
  render($('#view-progress'), html`
    <div class="page-head"><h1>Progress</h1></div>
    <div class="card"><h3>Practice minutes, last 14 days</h3>
      <div class="minutes">${days14.map(x => html`<div class="mcol" title="${x.key}: ${Math.round(x.m)} min"><i style="height:${Math.min(100, (x.m / store.settings.minutesPerDay) * 100)}%" class="${x.m >= store.settings.minutesPerDay ? 'full' : ''}"></i><span>${'SMTWTFS'[x.d.getDay()]}</span></div>`)}</div>
      <p class="muted small">${store.streak()} day streak · goal ${store.settings.minutesPerDay} min/day</p></div>
    <div class="card"><h3>Seventh chords <span class="muted small">median of your last 3 times · green = under 3 s</span></h3>
      ${['maj7', '7', 'm7'].map(q => html`<div class="crow"><span class="cq">${q === '7' ? 'dom7' : q}</span>${byQ(q).map(c => { const t = cardTime(p.cards[c.id]); return html`<span class="cg ${tcls(t)}" title="${t < Infinity ? `${(t / 1000).toFixed(1)} s` : 'not yet'}">${c.symbol}<small>${t < Infinity ? (t / 1000).toFixed(1) : '–'}</small></span>`; })}</div>`)}
    </div>
    <div class="card"><h3>Coordination Exercise 1 <span class="muted small">✓ = passed (part 2 at ♩ = 100+)</span></h3>
      <table class="keys"><tr><th></th>${KEYS_FOURTHS.map(k => html`<th>${noteLabel(parseNote(k))}</th>`)}</tr>
        <tr><th>Part 1</th>${KEYS_FOURTHS.map(k => coordCell(k, 1))}</tr>
        <tr><th>Part 2</th>${KEYS_FOURTHS.map(k => coordCell(k, 2))}</tr></table>
      <p class="muted small">${KEYS_FOURTHS.filter(k => coordPassed(p, k, 2)).length} of 12 keys passed</p></div>
    <div class="card"><h3>Technique <span class="muted small">✓ = a clean take</span></h3>
      ${Object.keys(p.keys.tech || {}).length ? Object.entries(p.keys.tech).map(([key, sets]) => { const [ex, q] = key.split(':'); const qs = q.split(','); return html`<div class="crow"><span class="cq wide">${TECH[ex].title}, ${qs.length > 1 ? 'mixed' : qs[0] === '7' ? 'dom7' : qs[0]}</span>${Object.entries(sets).map(([k, st]) => html`<span class="cg ${st.clean ? 'ok' : 'mid'}" title="best ${Math.round((st.best?.accuracy || 0) * 100)}% at ♩ ${st.best?.bpm || '–'}">${setLabel(ex, qs, +k)}<small>${st.clean ? '✓' : `${Math.round((st.best?.accuracy || 0) * 100)}%`} ♩${st.best?.bpm || ''}</small></span>`)}</div>`; }) : html`<p class="muted">No technique takes yet.</p>`}</div>
    <div class="card"><h3>Swing checks</h3>
      ${(p.swing || []).length ? html`<div class="swing-hist">${p.swing.slice(-16).map(s => html`<div class="sh ${s.passed ? 'ok' : ''}" title="♩ ${s.bpm} · accent ${Math.round((s.accent - 1) * 100)}%"><i style="bottom:${Math.round(s.placement * 100)}%"></i><span>${Math.round(s.placement * 100)}</span></div>`)}</div>
        <p class="muted small">Where your offbeats land (% of the beat). The band is the swing zone around 67%.</p>` : html`<p class="muted">No swing checks yet.</p>`}</div>
    <div class="card"><h3>Other</h3>
      <div class="stat-row">
        <div class="stat"><b>${p.drone || 0}</b><span>drone sessions</span></div>
        <div class="stat"><b>${p.listens.freddie || 0}</b><span>listens to “Freddie Freeloader”</span></div>
        <div class="stat"><b>${p.quizzes.freddie ? `${p.quizzes.freddie.best}/${p.quizzes.freddie.of}` : '–'}</b><span>form quiz</span></div>
        <div class="stat"><b>${p.quizzes.spell ? `${Math.round(p.quizzes.spell.best * 100)}%` : '–'}</b><span>best spelling round</span></div>
        <div class="stat"><b>${Object.values(p.keys.vamp || {}).length ? Object.entries(p.keys.vamp).map(([b, v]) => `${{ 8: '2 bars', 4: '1 bar', 2: '2 beats', 1: '1 beat' }[b]}: ${Math.round(v.pct * 100)}%`).join(' · ') : '–'}</b><span>vamp best</span></div>
      </div></div>`);
}

// ---------------- Settings ----------------
function renderSettings() {
  const s = store.settings;
  render($('#view-settings'), html`
    <div class="page-head"><h1>Settings</h1></div>
    <div class="settings">
      <div class="card"><h3>MIDI keyboard</h3>
        <p><span class="dot ${midi.connected ? 'on' : ''}"></span> ${midi.label}</p>
        <label>Input <select data-s="midiIn"><option value="">All inputs</option>${midi.inputs.map(i => html`<option value="${i.id}" ${s.midiIn === i.id ? 'selected' : ''}>${i.name}</option>`)}</select></label>
        <p class="muted small">Play a key to test: <b id="midiTest">nothing yet</b></p>
        <label class="check"><input type="checkbox" data-s="echo" ${s.echo ? 'checked' : ''}> Play MIDI notes through the app too (if your piano has no speakers)</label>
        <p class="muted small">Web MIDI needs Chrome or Edge. Bluetooth pianos need pairing in your system’s MIDI settings first.</p>
      </div>
      <div class="card"><h3>Sound and look</h3>
        <label>Volume <input type="range" min="0" max="1" step="0.05" value="${s.volume}" data-s="volume"></label>
        <label>Theme <select data-s="theme"><option value="">Match system</option><option value="dark" ${s.theme === 'dark' ? 'selected' : ''}>Dark</option><option value="light" ${s.theme === 'light' ? 'selected' : ''}>Light</option></select></label>
        <label>Daily goal <select data-s="minutesPerDay">${[20, 30, 45, 60].map(m => html`<option value="${m}" ${s.minutesPerDay === m ? 'selected' : ''}>${m} minutes</option>`)}</select></label>
      </div>
      <div class="card"><h3>Your data</h3>
        <p class="muted small">Progress lives in this browser only. Export it to move to another device.</p>
        <div class="row"><button class="btn" data-a="export">Export</button><label class="btn">Import<input type="file" accept="application/json" data-a="import" hidden></label>
          <button class="btn danger" data-a="reset">Reset all progress</button></div>
        <p class="muted small">Current day: ${P().day} · <button class="btn ghost small" data-a="back">Go back a day</button> <button class="btn ghost small" data-a="skip">Skip ahead a day</button></p>
      </div>
      <div class="card"><h3>About</h3>
        <p class="muted small">A self-contained daily jazz piano course. Topics follow the order of <i>${BOOK}</i>; the lessons and exercises are written for this app.
          Recordings for the listening steps are on your streaming service.</p>
      </div>
    </div>`);
  const v = $('#view-settings');
  v.querySelectorAll('[data-s]').forEach(inp => {
    inp.onchange = inp.oninput = () => {
      const k = inp.dataset.s;
      const val = inp.type === 'checkbox' ? inp.checked : inp.type === 'range' ? +inp.value : k === 'minutesPerDay' ? +inp.value : inp.value || null;
      s[k] = val; store.save();
      if (k === 'volume') audio.setVolume(val);
      if (k === 'theme') applyTheme();
      if (k === 'midiIn') midi.select(val);
    };
  });
  v.querySelector('[data-a=export]').onclick = () => {
    const blob = new Blob([JSON.stringify(store.data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `jazz-piano-progress-${store.today()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  v.querySelector('[data-a=import]').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { const d = JSON.parse(await f.text()); if (!d.progress) throw new Error('not a progress file'); store.data = { ...store.data, ...d }; store.save(); location.reload(); }
    catch (err) { alert(`Couldn’t import: ${err.message}`); }
  };
  v.querySelector('[data-a=reset]').onclick = () => { if (confirm('Erase all progress, chord times and settings in this browser?')) { store.reset(); location.hash = '#today'; location.reload(); } };
  v.querySelector('[data-a=back]').onclick = () => { P().day = Math.max(1, P().day - 1); store.save(); renderSettings(); };
  v.querySelector('[data-a=skip]').onclick = () => { P().day++; store.save(); renderSettings(); };
}

// ---------------- routing ----------------
const view = () => (location.hash.slice(1) || 'today').split('/')[0];
function route() {
  const v = ['today', 'path', 'practice', 'progress', 'settings'].includes(view()) ? view() : 'today';
  document.querySelectorAll('.view').forEach(el => el.classList.toggle('active', el.id === `view-${v}`));
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.view === v));
  if (v !== 'practice' && S.inst) { S.inst.destroy(); S.inst = null; S.cfg = null; kb.setTargets([]); }
  if (v === 'today') renderToday();
  if (v === 'path') renderPath();
  if (v === 'practice') mountPractice();
  if (v === 'progress') renderProgress();
  if (v === 'settings') renderSettings();
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
document.addEventListener('keydown', e => {
  const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) && document.activeElement.type !== 'checkbox';
  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Space' && view() === 'practice' && S.inst && S.inst.onSpace) { e.preventDefault(); S.inst.onSpace(); }
});
document.addEventListener('pointerdown', () => { if (window.Tone && Tone.getContext().state !== 'running') Tone.start(); }, { once: true });

// ---------------- feedback ----------------
initFeedback({
  getContext() {
    const c = { view: view(), day: P().day, midi: { connected: midi.connected, device: midi.connected ? midi.label : null }, theme: store.settings.theme || 'system' };
    if (S.cfg) c.step = { day: S.n, index: S.i, free: S.free, ...S.cfg };
    return c;
  },
  describeKey: m => ({ name: noteName(m), midi: m }),
});

window.__jazz = { store, S, midi, audio, kb }; // for debugging from the console
audio.volume = store.settings.volume;
route();
midi.init(store.settings.midiIn).then(updateMidiPill);
