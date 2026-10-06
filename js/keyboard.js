// 88-key piano keyboard (A0–C8) as SVG: targets with finger numbers, hand zones, pressed-key feedback.
const LOW = 21, HIGH = 108;
const WHITE_PC = new Set([0, 2, 4, 5, 7, 9, 11]);
export const isWhite = m => WHITE_PC.has(m % 12);
const W = 24, WH = 118, BW = 14, BH = 74, TOP = 18;
const whiteIndex = [];
{ let w = 0; for (let m = LOW; m <= HIGH; m++) { whiteIndex[m] = w; if (isWhite(m)) w++; } }
export const KEYS_WIDTH = whiteIndex[HIGH] * W + W;
export function keyGeom(m) {
  if (isWhite(m)) return { x: whiteIndex[m] * W, w: W, black: false };
  return { x: whiteIndex[m] * W - BW / 2, w: BW, black: true };
}
const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);
const SVGNS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

export class Keyboard {
  constructor(container, { onPress, onRelease } = {}) {
    this.container = container;
    this.svg = el('svg', { viewBox: `0 0 ${KEYS_WIDTH} ${TOP + WH + 2}`, class: 'kb-svg', preserveAspectRatio: 'xMidYMid meet' });
    container.appendChild(this.svg);
    this.zoneLayer = el('g', { class: 'kb-zones' }, this.svg);
    this.whiteLayer = el('g', {}, this.svg);
    this.blackLayer = el('g', {}, this.svg);
    this.labelLayer = el('g', { class: 'kb-labels' }, this.svg);
    this.keys = {};
    for (let m = LOW; m <= HIGH; m++) {
      const g = keyGeom(m);
      const r = el('rect', {
        x: g.x + (g.black ? 0 : 0.5), y: TOP, width: g.black ? g.w : g.w - 1, height: g.black ? BH : WH,
        rx: g.black ? 2 : 3, class: g.black ? 'key black' : 'key white', 'data-midi': m,
      }, g.black ? this.blackLayer : this.whiteLayer);
      this.keys[m] = r;
      if (m === 60) el('circle', { cx: g.x + W / 2, cy: TOP + WH - 8, r: 2.2, class: 'kb-middlec' }, this.whiteLayer);
      if (m % 12 === 0) { const t = el('text', { x: g.x + W / 2, y: TOP + WH - 14, class: 'kb-octave' }, this.whiteLayer); t.textContent = 'C' + (m / 12 - 1); }
    }
    this.labels = {};
    this.state = {}; // midi -> pressed state
    // pointer input (for testing without MIDI)
    const down = new Set();
    this.svg.addEventListener('pointerdown', e => {
      const m = +e.target.getAttribute('data-midi');
      if (!m) return;
      e.preventDefault(); down.add(m); onPress && onPress(m, 90, performance.now());
      const up = () => { down.delete(m); onRelease && onRelease(m); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointerup', up);
    });
  }

  /** targets: [{midi, hand:'R'|'L', finger, strength}] */
  setTargets(targets) {
    for (const m in this.labels) { this.labels[m].remove(); }
    this.labels = {};
    for (let m = LOW; m <= HIGH; m++) this.keys[m].classList.remove('t-R', 't-L', 't-K', 't-next-R', 't-next-L', 't-next-K');
    const byMidi = {};
    for (const t of targets) if (!byMidi[t.midi] || (t.strength || 1) > (byMidi[t.midi].strength || 1)) byMidi[t.midi] = t;
    for (const t of Object.values(byMidi)) {
      const k = this.keys[t.midi]; if (!k) continue;
      const strong = (t.strength ?? 1) >= 0.99;
      k.classList.add(strong ? `t-${t.hand}` : `t-next-${t.hand}`);
      if (t.finger && strong) {
        const g = keyGeom(t.midi);
        const cx = g.x + g.w / 2, cy = g.black ? TOP + BH - 12 : TOP + WH - 28;
        const grp = el('g', { class: `kb-finger f-${t.hand}${t.mine ? ' f-mine' : ''}` }, this.labelLayer);
        const wide = String(t.finger).length > 1;
        if (wide) el('rect', { x: cx - 11, y: cy - 7, width: 22, height: 14, rx: 7 }, grp);
        else el('circle', { cx, cy, r: g.black ? 6.5 : 8 }, grp);
        const tx = el('text', { x: cx, y: cy + 0.5 }, grp); tx.textContent = t.finger;
        this.labels[t.midi] = grp;
      }
    }
  }

  /** zones: {R:[lo,hi], L:[lo,hi]} */
  setZones(zones) {
    this.zoneLayer.replaceChildren();
    for (const [hand, z] of Object.entries(zones || {})) {
      if (!z) continue;
      const a = keyGeom(Math.max(LOW, z[0])), b = keyGeom(Math.min(HIGH, z[1]));
      const x0 = a.x - 2, x1 = b.x + b.w + 2;
      el('rect', { x: x0, y: 2, width: Math.max(10, x1 - x0), height: TOP - 6, rx: 6, class: `zone zone-${hand}` }, this.zoneLayer);
      const t = el('text', { x: (x0 + x1) / 2, y: TOP - 7, class: `zone-label` }, this.zoneLayer);
      t.textContent = hand === 'R' ? 'Right hand' : 'Left hand';
    }
  }

  press(m, kind = 'neutral') {
    const k = this.keys[m]; if (!k) return;
    k.classList.remove('p-ok', 'p-bad', 'p-neutral', 'p-play-R', 'p-play-L');
    k.classList.add('p-' + kind);
  }
  release(m) {
    const k = this.keys[m]; if (!k) return;
    k.classList.remove('p-ok', 'p-neutral', 'p-play-R', 'p-play-L');
    if (k.classList.contains('p-bad')) setTimeout(() => k.classList.remove('p-bad'), 250);
  }
  clearPressed() { for (let m = LOW; m <= HIGH; m++) this.keys[m].classList.remove('p-ok', 'p-bad', 'p-neutral', 'p-play-R', 'p-play-L'); }
  flash(m, kind) { this.press(m, kind); setTimeout(() => this.release(m), 180); }

  /** keep the active area visible on narrow screens */
  scrollTo(lo, hi) {
    const c = this.container; if (c.scrollWidth <= c.clientWidth + 2) return;
    const scale = c.scrollWidth / KEYS_WIDTH;
    const mid = ((keyGeom(lo).x + keyGeom(hi).x) / 2) * scale;
    c.scrollTo({ left: mid - c.clientWidth / 2, behavior: 'smooth' });
  }
}
