// Feedback button + element picker. A note is saved with the picked element, the app's current context
// and (optionally) a screenshot of that area, then POSTed to /api/feedback. This browser keeps a
// "Your notes" list and shows when a note has been resolved.
import { html, render } from './html.js';

const LS_KEY = 'jazz-piano-feedback-v1';
const SHOT_LIB = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js';
const TAGS = ['Looks off', 'Confusing', 'Bug', 'Wrong check / score', 'Idea'];
const REGIONS = [
  ['#kbWrap', 'Keyboard'], ['.lane', 'Exercise lane'], ['.ruler', 'Swing ruler'], ['.verdicts', 'Results'], ['.flash', 'Flash card'],
  ['.form-grid', 'Form grid'], ['.quiz', 'Quiz'], ['#drill', 'Drill'], ['.p-steps', 'Step bar'], ['#pHead', 'Practice header'],
  ['.free-grid', 'Drill menu'], ['.steps', 'Today’s steps'], ['.hero', 'Today summary'], ['.gates', 'Gates'], ['.unit', 'Unit'],
  ['#view-progress .card', 'Progress'], ['.settings .card', 'Settings'], ['.topbar', 'Top bar'], ['.view.active > .card', 'Card'], ['main', 'Page'],
];
const MIN_SHOT = { w: 300, h: 130 };

const $ = (s, r = document) => r.querySelector(s);
const load = () => { try { return JSON.parse(localStorage.getItem(LS_KEY)) || []; } catch { return []; } };
const saveList = list => { try { localStorage.setItem(LS_KEY, JSON.stringify(list.slice(-200))); } catch { /* storage full or blocked */ } };

export function initFeedback({ getContext, describeScorePoint, describeKey }) {
  let mode = 'idle'; // idle | picking | compose | list
  let hovered = null, selected = null, stack = [], pickPoint = null, version = 'dev', swallowClick = false, raf = 0;
  let hoverScore = null, selScore = null; // score position under the pointer / of the picked point
  fetch('version.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(v => { if (v) version = `${v.commit}${v.dirty ? '+' : ''}`; }).catch(() => {});

  // ---------- DOM ----------
  const ui = document.createElement('div');
  ui.className = 'fb-ui';
  document.body.appendChild(ui);
  render(ui, html`
    <button class="fb-fab" type="button" title="Feedback: pick something on the page and write a note (F)">
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4v-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm3 5v2h10V9H7Zm0 3v2h6v-2H7Z"/></svg>
      <span>Feedback</span></button>
    <div class="fb-hl" hidden></div>
    <div class="fb-tip" hidden></div>
    <div class="fb-bar" hidden>
      <b>Click the thing you want to comment on</b>
      <span class="fb-keys">↑ bigger · ↓ smaller · Esc cancel</span>
      <button type="button" data-a="page">Whole page</button>
      <button type="button" data-a="list">Your notes</button>
      <button type="button" data-a="cancel">Cancel</button>
    </div>
    <div class="fb-panel" hidden role="dialog" aria-label="Write feedback"></div>
    <div class="fb-list" hidden role="dialog" aria-label="Your feedback notes"></div>
    <div class="fb-toast" hidden></div>`);
  const fab = $('.fb-fab', ui), hl = $('.fb-hl', ui), tip = $('.fb-tip', ui), bar = $('.fb-bar', ui);
  const panel = $('.fb-panel', ui), listBox = $('.fb-list', ui), toast = $('.fb-toast', ui);
  fab.onclick = () => (mode === 'idle' ? startPicking() : stopAll());
  bar.onclick = e => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'page') choose(document.querySelector('.view.active') || document.body, null);
    if (a === 'list') openList();
    if (a === 'cancel') stopAll();
  };

  // ---------- picking ----------
  const inUi = el => !!(el && el.closest && el.closest('.fb-ui'));
  function startPicking() {
    closeList(); panel.hidden = true; mode = 'picking'; selected = null; hovered = null; stack = [];
    bar.hidden = false; document.documentElement.classList.add('fb-picking');
    fab.classList.add('on');
  }
  function stopAll() {
    mode = 'idle'; selected = hovered = null; stack = []; selScore = hoverScore = null;
    bar.hidden = hl.hidden = tip.hidden = panel.hidden = true;
    document.documentElement.classList.remove('fb-picking'); fab.classList.remove('on');
    cancelAnimationFrame(raf);
  }
  const clip = (r, c) => {
    const left = Math.max(r.left, c.left), top = Math.max(r.top, c.top);
    const right = Math.min(r.left + r.width, c.right), bottom = Math.min(r.top + r.height, c.bottom);
    return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
  };
  // element rect clipped to the scroll containers it sits in
  function visibleRect(el) {
    const b = el.getBoundingClientRect(); let r = { left: b.left, top: b.top, width: b.width, height: b.height };
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/(auto|scroll|hidden)/.test(getComputedStyle(p).overflow)) r = clip(r, p.getBoundingClientRect());
    }
    return r;
  }
  function scoreRect(sc) {
    const svg = document.querySelector('#scoreWrap .osmd-host svg');
    if (!svg || !sc || !sc.box) return null;
    const r = svg.getBoundingClientRect();
    return clip({ left: r.left + sc.box.x, top: r.top + sc.box.y, width: sc.box.w, height: sc.box.h }, document.querySelector('#scoreWrap').getBoundingClientRect());
  }
  const scoreText = sc => `Bar ${sc.bar}, beat ${sc.beat}${sc.staff ? ` · ${sc.staff === 1 ? 'upper' : 'lower'} staff` : ''}` +
    (sc.notes && sc.notes.length ? ` · ${sc.notes.map(n => `${n.name}${n.finger ? ` (${n.hand} ${n.finger})` : ''}`).join(', ')}` : '');
  function showBox(el, sc) {
    if (!el) { hl.hidden = tip.hidden = true; return; }
    const r = (sc && scoreRect(sc)) || visibleRect(el);
    Object.assign(hl.style, { left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
    hl.hidden = false;
    if (mode === 'picking') {
      tip.textContent = sc ? `Sheet music · ${scoreText(sc)}` : `${areaOf(el)} · ${shortLabel(el)}`;
      const ty = r.top > 34 ? r.top - 28 : r.top + r.height + 6;
      Object.assign(tip.style, { left: `${Math.max(6, Math.min(innerWidth - 260, r.left))}px`, top: `${ty}px` });
      tip.hidden = false;
    } else tip.hidden = true;
  }
  const onMove = e => {
    if (mode !== 'picking') return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || inUi(el)) { showBox(null); return; }
    if (!stack.length && el.closest('#scoreWrap') && !el.closest('.score-tools') && describeScorePoint) {
      hoverScore = describeScorePoint(e.clientX, e.clientY); hovered = el; showBox(el, hoverScore); return;
    }
    hoverScore = null;
    if (el !== hovered && !stack.length) { hovered = el; showBox(el); }
    else if (stack.length && !stack[0].contains(el) && el !== stack[0]) { stack = []; hovered = el; showBox(el); }
  };
  const onDown = e => {
    if (mode !== 'picking' || inUi(e.target)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    swallowClick = true;
    choose(hovered || document.elementFromPoint(e.clientX, e.clientY), { x: e.clientX, y: e.clientY });
  };
  const swallow = e => {
    if (inUi(e.target)) return;
    if (mode === 'picking' || swallowClick) { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation(); }
    if (e.type === 'click') swallowClick = false;
  };
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerdown', onDown, true);
  for (const t of ['mousedown', 'mouseup', 'pointerup', 'click', 'touchstart', 'touchend']) window.addEventListener(t, swallow, { capture: true, passive: false });
  window.addEventListener('keydown', e => {
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (mode === 'idle') {
      if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey && (e.key || '').toLowerCase() === 'f') { e.preventDefault(); startPicking(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); mode === 'list' && selected ? closeList() : stopAll(); return; }
    if (mode === 'picking') {
      e.preventDefault(); e.stopImmediatePropagation();
      const cur = stack[0] || hovered;
      if (e.key === 'ArrowUp' && cur && cur.parentElement && cur.parentElement !== document.documentElement) { stack.unshift(cur.parentElement); showBox(stack[0]); }
      if (e.key === 'ArrowDown' && stack.length) { stack.shift(); showBox(stack[0] || hovered); }
      if (e.key === 'Enter' && cur) choose(cur, null);
    } else if (mode === 'compose' && !typing) e.stopImmediatePropagation();
  }, true);

  function choose(el, point) {
    const expanded = !!stack[0];
    selected = expanded && point ? stack[0] : el; pickPoint = point; stack = [];
    selScore = !expanded && point && selected.closest && selected.closest('#scoreWrap') && describeScorePoint ? describeScorePoint(point.x, point.y) : null;
    mode = 'compose'; bar.hidden = true; tip.hidden = true;
    document.documentElement.classList.remove('fb-picking');
    openPanel();
    const follow = () => { if (mode === 'compose' && selected) { showBox(selected, selScore); raf = requestAnimationFrame(follow); } };
    cancelAnimationFrame(raf); follow();
  }

  // ---------- describing the picked element ----------
  function areaOf(el) {
    for (const [sel, name] of REGIONS) if (el.closest && el.closest(sel)) return name;
    return 'Page';
  }
  function shortLabel(el) {
    const tag = el.tagName.toLowerCase();
    const text = (el.getAttribute?.('aria-label') || el.getAttribute?.('title') || el.textContent || '').trim().replace(/\s+/g, ' ');
    if (el.dataset?.midi && describeKey) return `key ${describeKey(+el.dataset.midi).name}`;
    if (text && text.length <= 60) return `“${text}”`;
    if (text) return `“${text.slice(0, 57)}…”`;
    return `<${tag}${el.id ? '#' + el.id : ''}${el.classList?.length ? '.' + [...el.classList].slice(0, 2).join('.') : ''}>`;
  }
  function cssPath(el) {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.body && parts.length < 12; n = n.parentElement) {
      let p = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(`${p}#${n.id}`); break; }
      const cls = [...(n.classList || [])].filter(c => !/^(on|active|done|current|t-|p-)/.test(c)).slice(0, 2);
      if (cls.length) p += '.' + cls.join('.');
      const sibs = n.parentElement ? [...n.parentElement.children].filter(s => s.tagName === n.tagName) : [];
      if (sibs.length > 1) p += `:nth-of-type(${sibs.indexOf(n) + 1})`;
      parts.unshift(p);
    }
    return parts.join(' > ');
  }
  function describe(el, point) {
    const r = el.getBoundingClientRect();
    const d = {
      area: areaOf(el), label: shortLabel(el), selector: cssPath(el), tag: el.tagName.toLowerCase(),
      id: el.id || undefined, classes: [...(el.classList || [])].slice(0, 8),
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 300) || undefined,
      data: Object.keys(el.dataset || {}).length ? { ...el.dataset } : undefined,
      rect: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
      point: point || undefined,
    };
    if (selScore && el === selected) d.score = selScore;
    else if (el.closest('#scoreWrap') && point && describeScorePoint) d.score = describeScorePoint(point.x, point.y) || undefined;
    if (el.dataset?.midi && describeKey) d.key = describeKey(+el.dataset.midi);
    if (d.score) { d.label = scoreText(d.score); delete d.text; }
    return d;
  }

  // ---------- compose panel ----------
  function openPanel() {
    const d = describe(selected, pickPoint);
    panel._desc = d;
    const s = d.score;
    render(panel, html`
      <div class="fb-head"><span class="fb-area">${d.area}</span><span class="fb-what">${s ? 'the spot you clicked' : d.label}</span></div>
      ${s ? html`<div class="fb-score">${scoreText(s)}</div>` : ''}
      ${d.key ? html`<div class="fb-score">Key ${d.key.name}${d.key.finger ? ` · shown as ${d.key.hand} finger ${d.key.finger}` : ''}</div>` : ''}
      <div class="fb-tags">${TAGS.map(t => html`<button type="button" class="fb-tag" data-tag="${t}">${t}</button>`)}</div>
      <textarea rows="4" placeholder="What don’t you like, or what should change?"></textarea>
      <label class="fb-check"><input type="checkbox" checked> Attach a screenshot of this area</label>
      <div class="fb-actions">
        <button type="button" data-a="again" class="fb-link">Pick something else</button>
        <span class="fb-status" aria-live="polite"></span>
        <button type="button" data-a="cancel">Cancel</button>
        <button type="button" data-a="send" class="fb-send">Send <kbd>⌘↵</kbd></button>
      </div>`);
    panel.hidden = false;
    const ta = $('textarea', panel);
    setTimeout(() => ta.focus(), 30);
    panel.querySelectorAll('.fb-tag').forEach(b => b.onclick = () => b.classList.toggle('on'));
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } });
    panel.querySelector('[data-a=again]').onclick = startPicking;
    panel.querySelector('[data-a=cancel]').onclick = stopAll;
    panel.querySelector('[data-a=send]').onclick = send;
  }

  async function send() {
    const ta = $('textarea', panel); const status = $('.fb-status', panel); const btn = $('.fb-send', panel);
    const note = ta.value.trim();
    if (!note) { status.textContent = 'Write a few words first.'; ta.focus(); return; }
    btn.disabled = true;
    const tags = [...panel.querySelectorAll('.fb-tag.on')].map(b => b.dataset.tag);
    const element = panel._desc;
    let context = {};
    try { context = getContext ? getContext() : {}; } catch (e) { context = { error: String(e) }; }
    Object.assign(context, { version, url: location.href, viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio }, ua: navigator.userAgent, at: new Date().toISOString() });
    let screenshot = null;
    if ($('.fb-check input', panel).checked) {
      status.textContent = 'Taking screenshot…';
      hl.hidden = true;
      try { screenshot = await withTimeout(capture(selected), 12000); } catch (e) { console.warn('screenshot failed', e); context.screenshotError = String(e && e.message || e); }
    }
    status.textContent = 'Sending…';
    const payload = { note, tags, element, context, screenshot };
    const entry = { localId: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), createdAt: new Date().toISOString(), note, tags, area: element.area, label: element.label };
    const list = load();
    try {
      const id = await post(payload);
      entry.id = id; entry.state = 'open';
      list.push(entry); saveList(list);
      stopAll(); flash('Thanks! Your note is saved.');
    } catch (e) {
      entry.state = 'unsent'; entry.payload = screenshot && screenshot.length > 900000 ? { ...payload, screenshot: null } : payload;
      list.push(entry); saveList(list);
      stopAll(); flash('Saved in this browser. It will be sent when the server is reachable.', true);
    }
  }
  async function post(payload) {
    const r = await fetch('api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
    return j.id;
  }
  async function retryUnsent() {
    const list = load(); let changed = false;
    for (const e of list) {
      if (e.state !== 'unsent' || !e.payload) continue;
      try { e.id = await post(e.payload); e.state = 'open'; delete e.payload; changed = true; } catch { break; }
    }
    if (changed) saveList(list);
  }
  function flash(msg, warn) {
    toast.textContent = msg; toast.classList.toggle('warn', !!warn); toast.hidden = false;
    clearTimeout(flash.t); flash.t = setTimeout(() => (toast.hidden = true), 3500);
  }

  // ---------- screenshot ----------
  let libPromise = null;
  function lib() {
    if (window.htmlToImage) return Promise.resolve(window.htmlToImage);
    libPromise ||= new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = SHOT_LIB; s.onload = () => res(window.htmlToImage); s.onerror = () => rej(new Error('screenshot library failed to load'));
      document.head.appendChild(s);
    });
    return libPromise;
  }
  function captureRoot(el) {
    let n = el;
    while (n && n !== document.body) {
      const r = n.getBoundingClientRect();
      // html-to-image needs an HTML element as the root (an <svg> root can hang)
      if (n instanceof HTMLElement && (n.id === 'scoreWrap' || (r.width >= MIN_SHOT.w && r.height >= MIN_SHOT.h))) return n;
      n = n.parentElement;
    }
    return document.querySelector('.view.active') || document.body;
  }
  async function capture(el) {
    const root = el.closest('#scoreWrap') ? document.querySelector('#scoreWrap') : captureRoot(el);
    const rr = root.getBoundingClientRect();
    const ratio = Math.min(2, devicePixelRatio || 1) * (rr.height > 1600 ? 0.6 : 1);
    let canvas, origin;
    if (root.id === 'scoreWrap') ({ canvas, origin } = await captureScore(root, ratio));
    else {
      const h2i = await lib();
      const bg = getComputedStyle(document.body).backgroundColor;
      const restore = inlineLiveState(root);
      try {
        canvas = await withTimeout(h2i.toCanvas(root, { pixelRatio: ratio, skipFonts: true, backgroundColor: bg, filter: n => !(n.classList && n.classList.contains('fb-ui')) }), 8000);
      } finally { restore(); }
      origin = { x: rr.left, y: rr.top };
      // keep tall areas to what is on screen
      const top = Math.max(0, -rr.top), vis = Math.min(rr.height - top, innerHeight);
      if (rr.height > innerHeight * 1.3) canvas = crop(canvas, 0, top * ratio, canvas.width, vis * ratio), origin.y += top;
    }
    if (el !== root || selScore) {
      const r = (selScore && scoreRect(selScore)) || visibleRect(el); const ctx = canvas.getContext('2d');
      const x = (r.left - origin.x) * ratio, y = (r.top - origin.y) * ratio;
      ctx.fillStyle = 'rgba(255, 64, 112, 0.12)'; ctx.fillRect(x - 3 * ratio, y - 3 * ratio, r.width * ratio + 6 * ratio, r.height * ratio + 6 * ratio);
      ctx.strokeStyle = '#ff4070'; ctx.lineWidth = 3 * ratio;
      ctx.strokeRect(x - 3 * ratio, y - 3 * ratio, r.width * ratio + 6 * ratio, r.height * ratio + 6 * ratio);
    }
    if (canvas.width > 1600) canvas = crop(canvas, 0, 0, canvas.width, canvas.height, 1600 / canvas.width);
    return canvas.toDataURL('image/jpeg', 0.82);
  }
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('screenshot timed out')), ms))]);
  // html-to-image copies attributes, not live state: mirror checkbox state and CSS-driven SVG colours while capturing
  function inlineLiveState(root) {
    const undo = [];
    for (const i of root.querySelectorAll('input[type=checkbox], input[type=radio]')) {
      const had = i.hasAttribute('checked');
      if (i.checked !== had) { i.toggleAttribute('checked', i.checked); undo.push(() => i.toggleAttribute('checked', had)); }
    }
    for (const n of root.querySelectorAll('svg *')) {
      if (n.closest('.osmd-host') || !(n instanceof SVGElement)) continue;
      const cs = getComputedStyle(n); const prev = n.getAttribute('style');
      n.setAttribute('style', `${prev ? prev + ';' : ''}fill:${cs.fill};stroke:${cs.stroke};stroke-width:${cs.strokeWidth};opacity:${cs.opacity}` +
        (n.tagName === 'text' ? `;font:${cs.font};text-anchor:${cs.textAnchor};dominant-baseline:${cs.dominantBaseline}` : ''));
      undo.push(() => (prev === null ? n.removeAttribute('style') : n.setAttribute('style', prev)));
    }
    return () => undo.forEach(f => f());
  }
  function crop(src, x, y, w, h, scale = 1) {
    const c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
    c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, c.width, c.height);
    return c;
  }
  async function captureScore(wrap, ratio) {
    const svg = wrap.querySelector('.osmd-host svg');
    if (!svg) throw new Error('no score svg');
    const wr = wrap.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    const x0 = Math.max(wr.left, sr.left), y0 = Math.max(wr.top, sr.top);
    const x1 = Math.min(wr.right, sr.right), y1 = Math.min(wr.bottom, sr.bottom);
    const w = x1 - x0, h = y1 - y0;
    const clone = svg.cloneNode(true);
    const vb = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal : null;
    const sx = vb ? vb.width / sr.width : 1, sy = vb ? vb.height / sr.height : 1;
    clone.setAttribute('viewBox', `${(vb ? vb.x : 0) + (x0 - sr.left) * sx} ${(vb ? vb.y : 0) + (y0 - sr.top) * sy} ${w * sx} ${h * sy}`);
    clone.setAttribute('width', w); clone.setAttribute('height', h);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('score render failed')); i.src = url; });
    const c = document.createElement('canvas'); c.width = Math.round(w * ratio); c.height = Math.round(h * ratio);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fbf9f3'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    // the playback cursor is an <img> beside the svg; draw it as a band if visible
    const cur = wrap.querySelector('.osmd-host img');
    if (cur && cur.style.display !== 'none') {
      const r = cur.getBoundingClientRect();
      ctx.fillStyle = 'rgba(79, 140, 255, 0.3)'; ctx.fillRect((r.left - x0) * ratio, (r.top - y0) * ratio, r.width * ratio, r.height * ratio);
    }
    return { canvas: c, origin: { x: x0, y: y0 } };
  }

  // ---------- your notes ----------
  async function openList() {
    mode = 'list'; bar.hidden = true; hl.hidden = tip.hidden = true; panel.hidden = true;
    document.documentElement.classList.remove('fb-picking');
    const list = load().slice().reverse();
    const ids = list.filter(e => e.id).map(e => e.id);
    drawList(list, null);
    listBox.hidden = false;
    if (ids.length) {
      try {
        const r = await fetch(`api/feedback/status?ids=${ids.slice(0, 100).join(',')}`, { cache: 'no-store' });
        if (r.ok) drawList(list, await r.json());
      } catch { /* offline: show local state only */ }
    }
  }
  function drawList(list, statuses) {
    const badge = e => {
      if (e.state === 'unsent') return html`<span class="fb-badge warn">not sent yet</span>`;
      const s = statuses && statuses[e.id];
      if (!s) return html`<span class="fb-badge">sent</span>`;
      if (s.state === 'open') return html`<span class="fb-badge">open</span>`;
      return html`<span class="fb-badge ok">${s.state}</span>`;
    };
    render(listBox, html`
      <div class="fb-head"><b>Your notes</b><span class="fb-what">${list.length} sent from this browser</span><button type="button" data-a="close" class="fb-x" aria-label="Close">×</button></div>
      ${list.length ? html`<ol>${list.map(e => html`<li>
          <div class="fb-row">${badge(e)}<span class="fb-area">${e.area || ''}</span><time>${new Date(e.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div>
          <div class="fb-note">${e.note}</div>
          ${statuses && statuses[e.id] && statuses[e.id].message ? html`<div class="fb-reply">↳ ${statuses[e.id].message}</div>` : ''}
        </li>`)}</ol>` : html`<p class="fb-empty">Nothing yet. Click “Feedback”, pick something and write a note.</p>`}
      <div class="fb-actions"><button type="button" data-a="new" class="fb-send">New note</button></div>`);
    listBox.querySelector('[data-a=close]').onclick = closeList;
    listBox.querySelector('[data-a=new]').onclick = () => { closeList(); startPicking(); };
  }
  function closeList() { listBox.hidden = true; if (mode === 'list') { mode = 'idle'; fab.classList.remove('on'); } }

  retryUnsent();
  return { start: startPicking, openList };
}
