// Sound: sampled grand piano (Tone.js + Salamander samples), a light jazz kit (ride, hi-hat, feathered kick),
// a plucked bass, a click, plus a lookahead scheduler shared by all drills.
/* global Tone */
const SAMPLE_BASE = 'https://tonejs.github.io/audio/salamander/';

class Audio {
  constructor() { this.ready = null; this.volume = 0.8; }
  init(onStatus) {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      await Tone.start();
      onStatus && onStatus('Loading piano…');
      this.out = new Tone.Volume(Tone.gainToDb(this.volume)).toDestination();
      this.reverb = new Tone.Reverb({ decay: 2.4, wet: 0.16 }).connect(this.out);
      if (this.reverb.ready) await this.reverb.ready;
      const urls = { A0: 'A0.mp3', C8: 'C8.mp3' };
      for (let o = 1; o <= 7; o++) Object.assign(urls, { [`C${o}`]: `C${o}.mp3`, [`D#${o}`]: `Ds${o}.mp3`, [`F#${o}`]: `Fs${o}.mp3`, [`A${o}`]: `A${o}.mp3` });
      try {
        this.piano = new Tone.Sampler({ urls, baseUrl: SAMPLE_BASE, release: 0.9 }).connect(this.reverb);
        await Tone.loaded();
      } catch (e) {
        this.piano = new Tone.PolySynth(Tone.Synth).connect(this.reverb);
        onStatus && onStatus('Using a simple synth (piano samples could not load)');
      }
      // drums
      this.ride = new Tone.MetalSynth({ envelope: { attack: 0.001, decay: 0.9, release: 0.3 }, harmonicity: 5.1, modulationIndex: 24, resonance: 5200, octaves: 1.2 }).connect(this.out);
      this.ride.frequency.value = 340; this.ride.volume.value = -27;
      this.hat = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } });
      this.hatFilter = new Tone.Filter(7000, 'highpass').connect(this.out); this.hat.connect(this.hatFilter); this.hat.volume.value = -24;
      this.kick = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 3, envelope: { attack: 0.001, decay: 0.25, sustain: 0 } }).connect(this.out);
      this.kick.volume.value = -26;
      // bass
      this.bass = new Tone.PluckSynth({ attackNoise: 1.2, dampening: 1400, resonance: 0.92 }).connect(this.out);
      this.bass.volume.value = 4;
      this.click = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.02 } }).connect(this.out);
      this.click.volume.value = -12;
      onStatus && onStatus('');
    })();
    return this.ready;
  }
  get ctx() { return Tone.getContext().rawContext; }
  now() { return Tone.now(); }
  setVolume(v) { this.volume = v; if (this.out) this.out.volume.rampTo(Tone.gainToDb(Math.max(0.0001, v)), 0.1); }
  note(midi) { return Tone.Frequency(midi, 'midi').toNote(); }
  play(midi, dur, time, vel = 0.5) { if (this.piano) this.piano.triggerAttackRelease(this.note(midi), Math.max(0.06, dur), time, vel); }
  chord(midis, dur, time, vel = 0.45) { for (const m of midis) this.play(m, dur, time, vel); }
  attack(midi, vel = 0.5) { if (this.piano) this.piano.triggerAttack(this.note(midi), undefined, vel); }
  releaseNote(midi) { if (this.piano) this.piano.triggerRelease(this.note(midi)); }
  drum(kind, time, vel = 1) {
    if (kind === 'ride' && this.ride) this.ride.triggerAttackRelease('16n', time, 0.35 * vel);
    if (kind === 'hat' && this.hat) this.hat.triggerAttackRelease('32n', time, 0.6 * vel);
    if (kind === 'kick' && this.kick) this.kick.triggerAttackRelease('C1', '16n', time, 0.5 * vel);
  }
  playBass(midi, dur, time, vel = 0.8) { if (this.bass) this.bass.triggerAttackRelease(this.note(midi), Math.max(0.1, dur), time, vel); }
  tick(time, level = 1) {
    if (!this.click) return;
    this.click.triggerAttackRelease(level === 2 ? 'A5' : level === 1 ? 'E5' : 'B4', 0.03, time, level === 2 ? 0.9 : level === 1 ? 0.55 : 0.22);
  }
  stopAll() { if (this.piano && this.piano.releaseAll) this.piano.releaseAll(); }
  /** audio-context time of what's coming out of the speakers now */
  heardTime() {
    const ctx = this.ctx;
    if (ctx.getOutputTimestamp) { const ts = ctx.getOutputTimestamp(); if (ts.contextTime) return ts.contextTime; }
    return ctx.currentTime - (ctx.outputLatency || ctx.baseLatency || 0);
  }
  /** a MIDI/DOM timestamp (performance.now ms) as audio-context time, as heard */
  perfToAudio(ms) {
    const ctx = this.ctx;
    if (ctx.getOutputTimestamp) { const ts = ctx.getOutputTimestamp(); if (ts.performanceTime) return ts.contextTime + (ms - ts.performanceTime) / 1000; }
    return ctx.currentTime - (ctx.outputLatency || 0) + (ms - performance.now()) / 1000;
  }
}
export const audio = new Audio();

/**
 * Schedules a list of {t (seconds from start), kind, ...} events with a short lookahead.
 * kinds: 'note' {midi, dur, vel} · 'chord' {midis, dur, vel} · 'bass' {midi, dur} · 'drum' {drum, vel} · 'tick' {level}
 */
export class Scheduler {
  constructor(events, t0) { this.events = events.slice().sort((a, b) => a.t - b.t); this.t0 = t0; this.i = 0; this.timer = null; }
  start() { this.pump(); this.timer = setInterval(() => this.pump(), 25); return this; }
  stop() { clearInterval(this.timer); this.timer = null; }
  pump() {
    const horizon = audio.now() + 0.2;
    while (this.i < this.events.length && this.t0 + this.events[this.i].t < horizon) {
      const e = this.events[this.i++]; const at = Math.max(audio.now(), this.t0 + e.t);
      if (e.kind === 'note') audio.play(e.midi, e.dur, at, e.vel);
      else if (e.kind === 'chord') audio.chord(e.midis, e.dur, at, e.vel);
      else if (e.kind === 'bass') audio.playBass(e.midi, e.dur, at, e.vel);
      else if (e.kind === 'drum') audio.drum(e.drum, at, e.vel);
      else if (e.kind === 'tick') audio.tick(at, e.level);
    }
  }
}

/** swing ride pattern ("spang-a-lang") with hi-hat on 2 and 4, for `beats` beats at `bpm` */
export function swingGroove(beats, bpm, { from = 0, kick = true } = {}) {
  const b = 60 / bpm, ev = [];
  for (let i = 0; i < beats; i++) {
    const t = from + i * b, inBar = i % 4;
    ev.push({ t, kind: 'drum', drum: 'ride', vel: inBar === 0 ? 1 : 0.8 });
    if (inBar === 1 || inBar === 3) {
      ev.push({ t, kind: 'drum', drum: 'hat' });
      ev.push({ t: t + (2 / 3) * b, kind: 'drum', drum: 'ride', vel: 0.55 });
    }
    if (kick) ev.push({ t, kind: 'drum', drum: 'kick', vel: 0.5 });
  }
  return ev;
}
/** a one-bar count-in of quarter clicks before time 0 */
export function countIn(bpm, beats = 4) {
  const b = 60 / bpm;
  return Array.from({ length: beats }, (_, i) => ({ t: -(beats - i) * b, kind: 'tick', level: i === 0 ? 2 : 1 }));
}
