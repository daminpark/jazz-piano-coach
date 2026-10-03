// Web MIDI input: note on/off and sustain pedal from all (or one chosen) input devices.
export class MidiIn extends EventTarget {
  constructor() { super(); this.supported = !!navigator.requestMIDIAccess; this.inputs = []; this.selected = null; this.error = null; this.active = new Set(); }
  async init(selectedId) {
    this.selected = selectedId || null;
    if (!this.supported) { this.error = 'This browser has no Web MIDI. Use Chrome or Edge.'; this.emit('status'); return; }
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.access.onstatechange = () => this.bind();
      this.bind();
    } catch (e) { this.error = 'MIDI access was blocked: ' + e.message; this.emit('status'); }
  }
  bind() {
    this.inputs = [...this.access.inputs.values()];
    for (const inp of this.inputs) {
      inp.onmidimessage = (!this.selected || this.selected === inp.id) ? (e => this.handle(e, inp)) : null;
    }
    this.emit('status');
  }
  select(id) { this.selected = id || null; if (this.access) this.bind(); }
  handle(e, inp) {
    const [st, d1, d2] = e.data; const cmd = st & 0xf0;
    if (cmd === 0x90 && d2 > 0) { this.active.add(d1); this.emit('noteon', { midi: d1, vel: d2, time: e.timeStamp, source: inp.name }); }
    else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) { this.active.delete(d1); this.emit('noteoff', { midi: d1, time: e.timeStamp }); }
    else if (cmd === 0xb0 && d1 === 64) this.emit('pedal', { on: d2 >= 64, time: e.timeStamp });
  }
  /** inject notes from the on-screen keyboard or computer keys */
  virtual(type, midi, vel = 90) {
    if (type === 'noteon') this.active.add(midi); else this.active.delete(midi);
    this.emit(type, { midi, vel, time: performance.now(), source: 'screen' });
  }
  emit(type, detail = {}) { this.dispatchEvent(new CustomEvent(type, { detail })); }
  get label() {
    if (this.error) return this.error;
    if (!this.access) return 'MIDI not started';
    const live = this.inputs.filter(i => i.state === 'connected');
    if (!live.length) return 'No MIDI keyboard found';
    const sel = live.find(i => i.id === this.selected);
    return sel ? sel.name : live.map(i => i.name).join(', ');
  }
  get connected() { return !!this.access && this.inputs.some(i => i.state === 'connected'); }
}
export const midi = new MidiIn();
