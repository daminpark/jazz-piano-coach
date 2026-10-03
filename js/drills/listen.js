// Guided listening: play the track in your music app, start the follower at the same moment,
// and watch who's soloing, which chorus it is, and where you are in the 12-bar form. Then a short quiz.
import { html, render } from '../html.js';
import { TRACKS } from '../curriculum.js';

const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export const listen = {
  title: 'Guided listening',
  mount(ctx) {
    const { el, cfg, store } = ctx;
    const T = TRACKS[cfg.track || 'freddie'];
    const id = cfg.track || 'freddie';
    const end = T.map[T.map.length - 1].to;
    let t0 = null, offset = 0, timer = 0, paused = true, counted = false, quiz = cfg.quiz ? 'open' : null, answers = {};
    const P = store.progress;
    const now = () => (paused ? offset : offset + (performance.now() - t0) / 1000);

    function where(t) {
      const s = T.map.find(m => t >= m.from && t < m.to) || (t >= end ? T.map[T.map.length - 1] : T.map[0]);
      const bars = s.choruses * 12, barSec = (s.to - s.from) / bars;
      const bar = Math.max(0, Math.min(bars - 1, Math.floor((t - s.from) / barSec)));
      return { s, chorus: Math.floor(bar / 12) + 1, bar: bar % 12, barSec };
    }
    function play() {
      if (paused) { t0 = performance.now(); paused = false; timer = setInterval(paint, 100); }
      else { offset = now(); paused = true; clearInterval(timer); }
      draw();
    }
    function nudge(sec) { const t = Math.max(0, now() + sec); offset = t; t0 = performance.now(); paint(); }
    function paint() {
      const t = now();
      if (t >= end && !paused) { offset = end; paused = true; clearInterval(timer); markListened(); draw(); return; }
      if (!counted && t > end * 0.85) markListened();
      const w = where(t);
      const set = (sel, v) => { const n = el.querySelector(sel); if (n) n.textContent = v; };
      set('.l-time', fmt(t));
      set('.l-who', `${w.s.label}${w.s.who !== 'band' ? ` · ${w.s.who}` : ''}`);
      set('.l-chorus', `chorus ${w.chorus} of ${w.s.choruses}`);
      el.querySelectorAll('.form-grid .bar').forEach((b, k) => b.classList.toggle('now', k === w.bar));
      el.querySelectorAll('.l-map li').forEach(li => li.classList.toggle('now', +li.dataset.from === w.s.from));
      const pr = el.querySelector('.l-prog i'); if (pr) pr.style.width = `${Math.min(100, (t / end) * 100)}%`;
    }
    function markListened() {
      if (counted) return;
      counted = true;
      P.listens[id] = (P.listens[id] || 0) + 1; store.save();
      store.log({ drill: 'listen', track: id, n: P.listens[id] });
      if (!cfg.quiz) ctx.done({ listens: P.listens[id] });
      draw();
    }
    function draw() {
      const t = now(), w = where(t), n = P.listens[id] || 0;
      const q = P.quizzes[id];
      render(el, html`
        <div class="card drill-card listen">
          <div class="l-head">
            <div><h3>${T.title}</h3><div class="muted">${T.artist} · ${T.album}</div></div>
            <div class="l-count"><b>${n}</b><span>of 20 listens</span></div>
          </div>
          <div class="l-links muted small">Open it in:
            <a href="https://open.spotify.com/search/${encodeURIComponent(`${T.title} ${T.artist}`)}" target="_blank" rel="noopener">Spotify</a> ·
            <a href="https://music.apple.com/search?term=${encodeURIComponent(`${T.title} ${T.artist}`)}" target="_blank" rel="noopener">Apple Music</a> ·
            <a href="https://www.youtube.com/results?search_query=${encodeURIComponent(`${T.title} ${T.artist} Kind of Blue`)}" target="_blank" rel="noopener">YouTube</a>
            · then press Start here as the track begins.</div>
          <div class="l-now">
            <span class="l-time">${fmt(t)}</span>
            <span class="l-who">${w.s.label}${w.s.who !== 'band' ? ` · ${w.s.who}` : ''}</span>
            <span class="l-chorus muted">chorus ${w.chorus} of ${w.s.choruses}</span>
          </div>
          <div class="l-prog"><i></i></div>
          <div class="form-grid">${T.form.map((c, k) => html`<div class="bar ${k === w.bar ? 'now' : ''}"><small>${k + 1}</small>${c}</div>`)}</div>
          <div class="row">
            <button class="btn primary" data-a="play">${paused ? (t > 0 ? 'Resume' : 'Start') : 'Pause'} <kbd>Space</kbd></button>
            <button class="btn ghost" data-n="-5">−5 s</button><button class="btn ghost" data-n="-1">−1 s</button>
            <button class="btn ghost" data-n="1">+1 s</button><button class="btn ghost" data-n="5">+5 s</button>
            <button class="btn ghost" data-a="reset">Reset</button>
            <button class="btn" data-a="heard">I listened to it all</button>
            <button class="btn" data-a="quiz">Form quiz${q && q.passed ? ' ✓' : ''}</button>
          </div>
          <p class="muted small">${cfg.note || 'Follow the 12-bar form: count the bars, feel where each chorus starts again. Listen for how the pianist comps behind the soloists.'}
            Timings are approximate; nudge if the bar counter drifts.</p>
          <ol class="l-map">${T.map.map(m => html`<li data-from="${m.from}" class="${m === w.s ? 'now' : ''}"><span>${fmt(m.from)}</span> ${m.label}${m.who !== 'band' ? ` (${m.who})` : ''} · ${m.choruses} choruses</li>`)}</ol>
          <p class="muted small">Personnel: ${T.personnel.join(', ')}.</p>
          ${quiz ? quizBox() : ''}
        </div>`);
      el.querySelector('[data-a=play]').onclick = play;
      el.querySelector('[data-a=reset]').onclick = () => { paused = true; clearInterval(timer); offset = 0; draw(); };
      el.querySelector('[data-a=heard]').onclick = markListened;
      el.querySelector('[data-a=quiz]').onclick = () => { quiz = quiz ? null : 'open'; answers = {}; draw(); };
      el.querySelectorAll('[data-n]').forEach(b => { b.onclick = () => nudge(+b.dataset.n); });
      const form = el.querySelector('.quiz');
      if (form) { form.onchange = e => { answers[e.target.name] = +e.target.value; }; form.onsubmit = e => e.preventDefault(); }
      const sub = el.querySelector('[data-a=submit]');
      if (sub) sub.onclick = () => {
        const score = T.quiz.filter((qq, k) => answers[k] === qq.ok).length;
        const passed = score >= T.quiz.length - 1;
        P.quizzes[id] = { best: Math.max(score, P.quizzes[id]?.best || 0), of: T.quiz.length, passed: passed || !!P.quizzes[id]?.passed };
        store.save(); store.log({ drill: 'quiz', track: id, score, of: T.quiz.length });
        quiz = { score, passed };
        if (cfg.quiz) ctx.done({ score });
        draw();
      };
    }
    function quizBox() {
      const done = typeof quiz === 'object';
      return html`<form class="quiz">
        ${T.quiz.map((q, k) => html`<fieldset><legend>${k + 1}. ${q.q}</legend>${q.a.map((a, j) => html`<label class="${done ? (j === q.ok ? 'ok' : answers[k] === j ? 'bad' : '') : ''}"><input type="radio" name="${k}" value="${j}" ${answers[k] === j ? 'checked' : ''} ${done ? 'disabled' : ''}> ${a}</label>`)}</fieldset>`)}
        ${done ? html`<div class="verdicts ${quiz.passed ? 'pass' : ''}"><div class="verdict-title">${quiz.score} / ${T.quiz.length}${quiz.passed ? ' ✓ passed' : ': listen again and retry'}</div></div>`
          : html`<button type="button" class="btn primary" data-a="submit">Check answers</button>`}
      </form>`;
    }
    draw();
    return { onSpace: play, destroy() { clearInterval(timer); } };
  },
};
