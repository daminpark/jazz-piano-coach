// A small subset of ABC notation: enough to write short exercises once and both show them (abcjs) and
// check them (expected notes for MIDI matching). Assumes M:4/4, L:1/8, K:C with explicit accidentals.
// Supports notes ^ _ = , ' durations (2, 3/2, /), rests z, ties -, chords [CEG], triplets (3, "chord symbols", bars.
/* global ABCJS */

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NOTE = /^(\^\^|\^|__|_|=)?([A-Ga-g])([,']*)(\d*)(\/\d*)?(-)?/;
const REST = /^z(\d*)(\/\d*)?/;

function dur(num, slash) {
  let d = num ? +num : 1;
  if (slash) d /= slash.length > 1 ? +slash.slice(1) : 2;
  return d * 0.5; // L:1/8 -> quarter-note beats
}
function pitch(acc, letter, oct, carry) {
  const up = letter === letter.toLowerCase();
  const L = letter.toUpperCase();
  let m = 60 + LETTER[L] + (up ? 12 : 0);
  for (const c of oct) m += c === "'" ? 12 : -12;
  const key = `${L}${oct}${up}`;
  let a;
  if (acc) { a = { '^': 1, '^^': 2, _: -1, __: -2, '=': 0 }[acc]; carry[key] = a; } else a = carry[key] || 0;
  return m + a;
}

/** -> [{beat, dur, midi}] (chords give several notes at one beat), plus total beats */
export function parseAbc(body) {
  const notes = [];
  let s = body.replace(/"[^"]*"/g, ' ').replace(/![^!]*!/g, ' ');
  let beat = 0, carry = {}, tuplet = 0, tieFrom = new Map();
  const add = (midi, d, tie) => {
    const held = tieFrom.get(midi);
    if (held && Math.abs(held.beat + held.dur - beat) < 1e-6) { held.dur += d; tieFrom.delete(midi); if (tie) tieFrom.set(midi, held); return; }
    const n = { beat, dur: d, midi }; notes.push(n);
    if (tie) tieFrom.set(midi, n);
  };
  while (s.length) {
    const c = s[0];
    if (c === ' ' || c === '\n' || c === '\t') { s = s.slice(1); continue; }
    if (c === '|' || c === ']' || c === ':') { carry = {}; s = s.slice(1); continue; }
    if (c === '(' && /^\(\d/.test(s)) { tuplet = 3; s = s.slice(2); continue; }
    let m = s.match(REST);
    if (m) { let d = dur(m[1], m[2]); if (tuplet) { d *= 2 / 3; tuplet--; } beat += d; s = s.slice(m[0].length); continue; }
    if (c === '[') {
      const end = s.indexOf(']');
      const inner = s.slice(1, end); s = s.slice(end + 1);
      const dm = s.match(/^(\d*)(\/\d*)?(-)?/); s = s.slice(dm[0].length);
      let d = dur(dm[1], dm[2]); if (tuplet) { d *= 2 / 3; tuplet--; }
      let rest = inner;
      while (rest.length) { const nm = rest.match(NOTE); if (!nm) { rest = rest.slice(1); continue; } add(pitch(nm[1], nm[2], nm[3], carry), d, !!dm[3] || !!nm[6]); rest = rest.slice(nm[0].length); }
      beat += d; continue;
    }
    m = s.match(NOTE);
    if (m) { let d = dur(m[4], m[5]); if (tuplet) { d *= 2 / 3; tuplet--; } add(pitch(m[1], m[2], m[3], carry), d, !!m[6]); beat += d; s = s.slice(m[0].length); continue; }
    s = s.slice(1); // anything else (decorations, stray symbols) is ignored
  }
  return { notes, beats: beat };
}

/** swing written eighths: a note starting halfway through a beat moves to two-thirds of the beat */
export function swingNotes(notes) {
  const sw = b => { const f = b - Math.floor(b + 1e-6); return Math.abs(f - 0.5) < 1e-6 ? Math.floor(b + 1e-6) + 2 / 3 : b; };
  return notes.map(n => { const b = sw(n.beat), e = sw(n.beat + n.dur); return { ...n, beat: b, dur: Math.max(0.1, e - b) }; });
}

export const abcText = (body, { title, meter = '4/4' } = {}) => `X:1\n${title ? `T:${title}\n` : ''}M:${meter}\nL:1/8\nK:C\n${body}`;

/** draw with abcjs (loaded globally); falls back to the raw text if it isn't available */
export function drawAbc(el, body, opts = {}) {
  if (!window.ABCJS) { el.textContent = body; return; }
  ABCJS.renderAbc(el, abcText(body, opts), { responsive: 'resize', paddingtop: 4, paddingbottom: 4, paddingleft: 4, paddingright: 4, staffwidth: opts.width || 640, add_classes: true });
}
