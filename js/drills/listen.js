// Guided listening: the track plays inside the app (YouTube, or your own audio file), and the follower shows
// who's soloing, which chorus it is and which bar of the form you're in, in sync with the music. Then a short quiz.
/* global YT */
import { html, render } from '../html.js';
import { TRACKS } from '../curriculum.js';

const fmt = s => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

// ---- YouTube IFrame API, loaded once ----
let ytReady = null;
function loadYouTube() {
  if (ytReady) return ytReady;
  ytReady = new Promise((res, rej) => {
    if (window.YT && YT.Player) return res(YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); res(YT); };
    const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => rej(new Error('YouTube could not load'));
    document.head.appendChild(s);
  });
  return ytReady;
}

// ---- your own audio file, kept in this browser (IndexedDB) ----
const DB = 'jazz-piano-files';
function idb(mode, fn) {
  return new Promise((res, rej) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore('files');
    open.onerror = () => rej(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('files', mode); const req = fn(tx.objectStore('files'));
      tx.oncomplete = () => res(req && req.result); tx.onerror = () => rej(tx.error);
    };
  });
}
const loadFile = id => idb('readonly', st => st.get(id)).catch(() => null);
const saveFile = (id, blob) => idb('readwrite', st => st.put(blob, id));
const dropFile = id => idb('readwrite', st => st.delete(id));

export const listen = {
  title: 'Guided listening',
  mount(ctx) {
    const { el, cfg, store } = ctx;
    const id = cfg.track || 'freddie';
    const T = TRACKS[id];
    const end = T.length || T.map[T.map.length - 1].to;
    const P = store.progress, S = store.settings;
    const offsets = (S.listenOffset ||= {});
    let source = S.listenSource || 'youtube';
    let player = null, audioEl = null, fileUrl = null, timer = 0, manual = { t0: null, at: 0 };
    let counted = false, heard = 0, lastT = null, quiz = cfg.quiz ? 'open' : null, answers = {}, ytError = null;
    // one focus per listen; after the first full listen most tasks play just the part that matters
    const task = cfg.note ? { text: cfg.note } : T.tasks[(P.listens[id] || 0) % T.tasks.length];
    const range = [task.from ?? 0, task.to ?? end], span = range[1] - range[0];
    let wasPlaying = false, taps = [];

    // ---- one clock, whatever the source ----
    function rawTime() {
      if (source === 'youtube') return player && player.getCurrentTime ? player.getCurrentTime() : 0;
      if (source === 'file') return audioEl ? audioEl.currentTime : 0;
      return manual.t0 == null ? manual.at : manual.at + (performance.now() - manual.t0) / 1000;
    }
    const now = () => rawTime() + (offsets[id] || 0);
    function playing() {
      if (source === 'youtube') return !!(player && player.getPlayerState && player.getPlayerState() === 1);
      if (source === 'file') return !!(audioEl && !audioEl.paused);
      return manual.t0 != null;
    }
    function seek(t) {
      const raw = Math.max(0, t - (offsets[id] || 0));
      if (source === 'youtube' && player && player.seekTo) player.seekTo(raw, true);
      else if (source === 'file' && audioEl) audioEl.currentTime = raw;
      else { manual.at = raw; if (manual.t0 != null) manual.t0 = performance.now(); }
      lastT = null; paint();
    }
    function toggle() {
      if (source === 'youtube' && player && player.getPlayerState) { if (playing()) player.pauseVideo(); else player.playVideo(); }
      else if (source === 'file' && audioEl) { if (audioEl.paused) audioEl.play(); else audioEl.pause(); }
      else if (source === 'manual') { if (manual.t0 == null) manual.t0 = performance.now(); else { manual.at = rawTime(); manual.t0 = null; } drawControls(); }
    }

    // where every bar starts: measured from the recording when available (T.bars), else spread evenly per section
    const starts = T.bars || T.map.flatMap(m => Array.from({ length: m.choruses * 12 }, (_, k) => m.from + k * (m.to - m.from) / (m.choruses * 12))).concat(T.map[T.map.length - 1].to);
    const sectionOfBar = i => { let n = 0; for (const m of T.map) { const len = m.choruses * 12; if (i < n + len) return { s: m, k: i - n }; n += len; } const m = T.map[T.map.length - 1]; return { s: m, k: m.choruses * 12 - 1 }; };
    function where(t) {
      let i = 0; while (i < starts.length - 2 && starts[i + 1] <= t) i++;
      const { s, k } = sectionOfBar(i);
      const len = starts[i + 1] - starts[i];
      const beat = Math.max(0, Math.min(3, Math.floor(((t - starts[i]) / len) * 4)));
      return { s, chorus: Math.floor(k / 12) + 1, bar: k % 12, beat };
    }
    /** tap beat 1 of a few bars and the counter lines itself up with what you hear */
    function tap() {
      const raw = rawTime(), off = offsets[id] || 0;
      const t = raw + off, nearest = starts.reduce((b, x) => (Math.abs(x - t) < Math.abs(b - t) ? x : b), starts[0]);
      taps.push(nearest - raw); if (taps.length > 8) taps.shift();
      if (taps.length >= 3) {
        const sorted = taps.slice().sort((a, b) => a - b);
        offsets[id] = Math.round(sorted[Math.floor(sorted.length / 2)] * 20) / 20; store.save();
      }
      drawControls(); paint();
    }
    function paint() {
      const t = now();
      // count real listening time (not seeking), so a listen means you heard most of the track
      const r = rawTime();
      const isPlaying = playing();
      // starting play outside today's part jumps to it; reaching its end stops the music
      if (isPlaying && !wasPlaying && (t < range[0] - 1 || t > range[1] - 2)) { wasPlaying = true; seek(range[0]); return; }
      wasPlaying = isPlaying;
      if (isPlaying && span < end - 1 && t >= range[1] + 0.3) { pause(); markListenedIfMost(); }
      if (isPlaying && lastT != null && r - lastT > 0 && r - lastT < 1.5 && t >= range[0] - 0.5 && t <= range[1] + 0.5) heard += r - lastT;
      lastT = r;
      if (!counted && heard > span * 0.8) markListened();
      const w = where(t);
      const set = (sel, v) => { const n = el.querySelector(sel); if (n) n.textContent = v; };
      set('.l-time', fmt(t));
      set('.l-who', `${w.s.label}${w.s.who !== 'band' ? ` · ${w.s.who}` : ''}`);
      set('.l-chorus', `chorus ${w.chorus} of ${w.s.choruses} · bar ${w.bar + 1}`);
      el.querySelectorAll('.form-grid .bar').forEach((b, k) => { b.classList.toggle('now', k === w.bar); b.dataset.beat = k === w.bar && playing() ? w.beat + 1 : ''; });
      el.querySelectorAll('.l-map li').forEach(li => li.classList.toggle('now', +li.dataset.from === w.s.from));
      const pr = el.querySelector('.l-prog i'); if (pr) pr.style.width = `${Math.min(100, (t / end) * 100)}%`;
      set('.l-heard', `${Math.min(100, Math.round((heard / span) * 100))}% heard`);
    }
    function markListened() {
      if (counted) return;
      counted = true;
      P.listens[id] = (P.listens[id] || 0) + 1; store.save();
      store.log({ drill: 'listen', track: id, n: P.listens[id] });
      if (!cfg.quiz) ctx.done({ listens: P.listens[id] });
      const c = el.querySelector('.l-count b'); if (c) c.textContent = P.listens[id];
      const b = el.querySelector('[data-a=heard]'); if (b) { b.textContent = '✓ Listen counted'; b.disabled = true; }
    }

    // ---- players ----
    async function mountPlayer() {
      const box = el.querySelector('.l-player');
      if (player && player.destroy) { try { player.destroy(); } catch { /* already gone */ } }
      player = null; audioEl = null;
      if (source === 'youtube') {
        render(box, html`<div class="yt"><div id="yt-${id}"></div></div>`);
        try {
          await loadYouTube();
          player = new YT.Player(`yt-${id}`, {
            videoId: T.youtube, width: '100%', height: '100%',
            playerVars: { playsinline: 1, rel: 0, modestbranding: 1 },
            events: { onStateChange: e => { if (e.data === 0) markListenedIfMost(); drawControls(); }, onError: () => { ytError = 'This video can’t be played here. Try your own audio file instead.'; drawControls(); } },
          });
        } catch (e) { ytError = e.message; drawControls(); }
      } else if (source === 'file') {
        const blob = await loadFile(id);
        if (fileUrl) URL.revokeObjectURL(fileUrl);
        fileUrl = blob ? URL.createObjectURL(blob) : null;
        render(box, html`<div class="l-file">
          ${fileUrl ? html`<audio controls preload="auto" src="${fileUrl}"></audio>` : html`<p class="muted small">Choose an MP3 or other audio file of “${T.title}” (the album version, ${fmt(end)} long). It stays in this browser.</p>`}
          <label class="btn small">${fileUrl ? 'Use a different file' : 'Choose audio file'}<input type="file" accept="audio/*" hidden></label>
          ${fileUrl ? html`<button class="btn ghost small" data-a="forget">Forget file</button>` : ''}
        </div>`);
        audioEl = box.querySelector('audio');
        if (audioEl) { audioEl.onplay = audioEl.onpause = drawControls; audioEl.onended = markListenedIfMost; }
        box.querySelector('input[type=file]').onchange = async e => { const f = e.target.files[0]; if (!f) return; await saveFile(id, f); mountPlayer(); };
        const fg = box.querySelector('[data-a=forget]'); if (fg) fg.onclick = async () => { await dropFile(id); mountPlayer(); };
      } else {
        render(box, html`<p class="muted small">Play the track in Spotify, Apple Music or any app (<a href="https://open.spotify.com/search/${encodeURIComponent(`${T.title} ${T.artist}`)}" target="_blank" rel="noopener">Spotify</a> · <a href="https://music.apple.com/search?term=${encodeURIComponent(`${T.title} ${T.artist}`)}" target="_blank" rel="noopener">Apple Music</a>), and press <b>Start timer</b> at the same moment. Use the sync buttons if the counter drifts.</p>`);
      }
      drawControls();
    }
    function markListenedIfMost() { if (heard > span * 0.6) markListened(); }
    function pause() {
      if (source === 'youtube' && player && player.pauseVideo) player.pauseVideo();
      else if (source === 'file' && audioEl) audioEl.pause();
      else if (manual.t0 != null) { manual.at = rawTime(); manual.t0 = null; }
    }
    function playPart() { seek(range[0]); if (!playing()) toggle(); }
    function drawControls() {
      const c = el.querySelector('.l-controls'); if (!c) return;
      render(c, html`
        ${source === 'manual' ? html`<button class="btn primary" data-a="manual">${manual.t0 == null ? (manual.at ? 'Resume timer' : 'Start timer') : 'Pause timer'} <kbd>Space</kbd></button>` : html`<span class="muted small">${playing() ? 'Playing' : 'Press play'} · <kbd>Space</kbd> plays/pauses</span>`}
        <span class="l-sync" title="While the music plays, tap on beat 1 of a few bars (the first beat of each bar). The counter lines itself up with what you hear.">
          <button class="btn small" data-a="tap">Tap beat 1 to sync <kbd>T</kbd></button>
          <button class="btn ghost small" data-o="-0.25">−¼ s</button><button class="btn ghost small" data-o="0.25">+¼ s</button>
          ${offsets[id] ? html`<span class="muted small">${taps.length >= 3 ? 'synced ' : ''}${offsets[id] > 0 ? '+' : ''}${offsets[id]} s</span>` : taps.length ? html`<span class="muted small">${3 - taps.length} more tap${taps.length === 2 ? '' : 's'}</span>` : ''}</span>
        ${ytError && source === 'youtube' ? html`<span class="bad small">${ytError}</span>` : ''}`);
      const m = c.querySelector('[data-a=manual]'); if (m) m.onclick = toggle;
      c.querySelectorAll('[data-o]').forEach(b => { b.onclick = () => { offsets[id] = Math.round(((offsets[id] || 0) + +b.dataset.o) * 100) / 100; taps = []; store.save(); drawControls(); paint(); }; });
      c.querySelector('[data-a=tap]').onclick = tap;
    }

    function draw() {
      const t = now(), w = where(t), n = P.listens[id] || 0, q = P.quizzes[id];
      render(el, html`
        <div class="card drill-card listen">
          <div class="l-head">
            <div><h3>${T.title}</h3><div class="muted">${T.artist} · ${T.album}</div></div>
            <div class="l-count"><b>${n}</b><span>of 20 listens</span></div>
          </div>
          <ol class="howto">
            <li>${span < end - 1 ? html`Play <b>${fmt(range[0])}–${fmt(range[1])}</b> (${task.label}): <button class="btn small primary" data-a="part">▶ Play this part</button> It stops by itself.` : 'Press play on the music below. The bar counter follows it by itself.'}</li>
            <li><b>Listen for:</b> ${task.text}</li>
            <li>It counts as a listen once you’ve heard most of ${span < end - 1 ? 'this part' : 'the track'} (<span class="l-heard">0% heard</span>).${cfg.quiz ? ' Then take the form quiz.' : ''}</li>
          </ol>
          <div class="seg" role="tablist">${[['youtube', 'YouTube'], ['file', 'My audio file'], ['manual', 'Another app']].map(([k, l]) => html`<button class="${k === source ? 'on' : ''}" data-src="${k}">${l}</button>`)}</div>
          <div class="l-player"></div>
          <div class="row l-controls"></div>
          <div class="l-now">
            <span class="l-time">${fmt(t)}</span>
            <span class="l-who">${w.s.label}${w.s.who !== 'band' ? ` · ${w.s.who}` : ''}</span>
            <span class="l-chorus muted">chorus ${w.chorus} of ${w.s.choruses} · bar ${w.bar + 1}</span>
          </div>
          <div class="l-prog"><i></i></div>
          <div class="form-grid">${T.form.map((c, k) => html`<div class="bar ${k === w.bar ? 'now' : ''}"><small>${k + 1}</small>${c}</div>`)}</div>
          <p class="muted small">Click a section to jump there.</p>
          <ol class="l-map">${T.map.map(m => html`<li data-from="${m.from}" class="${m === w.s ? 'now' : ''}" tabindex="0"><span>${fmt(m.from)}</span> ${m.label}${m.who !== 'band' ? ` (${m.who})` : ''} · ${m.choruses} choruses</li>`)}</ol>
          <div class="row">
            <button class="btn" data-a="heard" ${counted ? 'disabled' : ''}>${counted ? '✓ Listen counted' : 'I listened to it all'}</button>
            <button class="btn" data-a="quiz">Form quiz${q && q.passed ? ' ✓' : ''}</button>
          </div>
          <p class="muted small">Personnel: ${T.personnel.join(', ')}.</p>
          <div class="quiz-slot"></div>
        </div>`);
      el.querySelectorAll('[data-src]').forEach(b => { b.onclick = () => { if (b.dataset.src === source) return; if (source === 'manual') { manual.at = rawTime(); manual.t0 = null; } source = b.dataset.src; S.listenSource = source; store.save(); lastT = null; draw(); }; });
      el.querySelectorAll('.l-map li').forEach(li => { li.onclick = () => seek(+li.dataset.from + 0.05); li.onkeydown = e => { if (e.key === 'Enter') li.onclick(); }; });
      el.querySelector('[data-a=heard]').onclick = markListened;
      const pp = el.querySelector('[data-a=part]'); if (pp) pp.onclick = playPart;
      el.querySelector('[data-a=quiz]').onclick = () => { quiz = quiz ? null : 'open'; answers = {}; drawQuiz(); };
      drawQuiz();
      mountPlayer();
    }
    // the quiz has its own slot, so opening it doesn't interrupt the music
    function drawQuiz() {
      const slot = el.querySelector('.quiz-slot');
      render(slot, quiz ? quizBox() : '');
      const qb = el.querySelector('[data-a=quiz]'); if (qb) qb.textContent = `Form quiz${P.quizzes[id]?.passed ? ' ✓' : ''}`;
      const form = slot.querySelector('.quiz');
      if (!form) return;
      form.onchange = e => { answers[e.target.name] = +e.target.value; };
      form.onsubmit = e => e.preventDefault();
      const sub = slot.querySelector('[data-a=submit]');
      if (sub) sub.onclick = () => {
        const score = T.quiz.filter((qq, k) => answers[k] === qq.ok).length;
        const passed = score >= T.quiz.length - 1;
        P.quizzes[id] = { best: Math.max(score, P.quizzes[id]?.best || 0), of: T.quiz.length, passed: passed || !!P.quizzes[id]?.passed };
        store.save(); store.log({ drill: 'quiz', track: id, score, of: T.quiz.length });
        quiz = { score, passed };
        if (cfg.quiz) ctx.done({ score });
        drawQuiz();
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
    timer = setInterval(paint, 100);
    return {
      onSpace: toggle,
      onKey(e) { if (e.code === 'KeyT') { tap(); return true; } return false; },
      destroy() {
        clearInterval(timer);
        if (player && player.destroy) { try { player.destroy(); } catch { /* already gone */ } }
        if (audioEl) audioEl.pause();
        if (fileUrl) URL.revokeObjectURL(fileUrl);
      },
    };
  },
};
