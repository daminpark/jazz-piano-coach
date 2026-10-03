// Every drill: mount(ctx) -> { noteOn?, noteOff?, onSpace?, destroy }
import { read } from './read.js';
import { drone } from './drone.js';
import { chords } from './chords.js';
import { spell } from './spell.js';
import { vamp } from './vamp.js';
import { coord } from './coord.js';
import { swing } from './swing.js';
import { listen } from './listen.js';

export const DRILLS = { read, drone, chords, spell, vamp, coord, swing, listen };
export const USES_KEYS = new Set(['drone', 'chords', 'vamp', 'coord', 'swing']);
