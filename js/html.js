// Tiny auto-escaping HTML templates: html`<b>${value}</b>` escapes every interpolated value
// unless it is itself an html`` result (or an array of them). render() swaps an element's content.
class SafeHTML { constructor(s) { this.s = s; } toString() { return this.s; } }
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = v => String(v).replace(/[&<>"']/g, c => ESC[c]);
function part(v) {
  if (v == null || v === false) return '';
  if (v instanceof SafeHTML) return v.s;
  if (Array.isArray(v)) return v.map(part).join('');
  return escape(v);
}
export function html(strings, ...vals) {
  let s = strings[0];
  vals.forEach((v, i) => { s += part(v) + strings[i + 1]; });
  return new SafeHTML(s);
}
export function render(el, tpl) {
  const range = document.createRange();
  range.selectNodeContents(el);
  el.replaceChildren(range.createContextualFragment(part(tpl)));
}
