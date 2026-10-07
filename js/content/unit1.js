// Unit 1 lessons, as guided steps: one short line, a demonstration (sound + keys lighting up), then your turn.
// The app listens and moves on by itself once you've played it.
//
// step: { say, demo?, do?, more? }
//   demo: { abc, bpm, swing, accent, ride, drone } | { chords: [[root, quality], ...], start?: [midis], root?: true }
//         | { keys: [midis] } | [demo, demo, ...] (played one after another)
//   do:   { chord: [root, quality] } | { hold: [midis] } | { chain: [[root, quality], ...], hints: 0-2, start?: [midis] }
//         | { notes: 'abc' } (these pitches in order, any octave) | { free: n, pcs?: [...] } (n notes, optionally from these pitch classes)
//         | { timed: 'abc', bpm, ride?, anyPitch?, need: { swing?, accent? } } (play along after a count-in)

const DRONE = [36, 43];
const LINE = 'C D E F G A B c | B A G F E D C2 |]';

export const UNIT1_LESSONS = {
  'u1-welcome': {
    title: 'First sounds: the drone and the major seventh',
    steps: [
      { say: 'A drone: a low C and G that never change. Listen to how the notes above it sound.', demo: { abc: '"C drone" z2 E2 G4- | G2 A G E4 | z4 D2 E2 | C8 |]', drone: DRONE, bpm: 72 } },
      { say: 'Your turn: hold low C and G with your left hand.', demo: { keys: DRONE }, do: { hold: DRONE } },
      { say: 'Right hand: play C, E or G a few times, slowly. Let each note ring over the drone.', do: { free: 4, pcs: [0, 4, 7] } },
      { say: 'B pulls up into C. Play B, then C.', demo: { abc: 'B4 c4- | c8 |]', drone: DRONE, bpm: 72 }, do: { notes: 'Bc' } },
      { say: 'F leans down into E. Play F, then E.', demo: { abc: 'F4 E4- | E8 |]', drone: DRONE, bpm: 72 }, do: { notes: 'FE' } },
      { say: 'Your first jazz chord, Cmaj7: a C major triad plus B, a half step below C.', demo: { keys: [60, 64, 67, 71] }, do: { chord: ['C', 'maj7'] } },
      { say: 'Fmaj7: F major plus E.', demo: { keys: [65, 69, 72, 76] }, do: { chord: ['F', 'maj7'] } },
      { say: 'E♭maj7: E♭ major plus D.', demo: { keys: [63, 67, 70, 74] }, do: { chord: ['Eb', 'maj7'] } },
      { say: 'No demo this time: Amaj7.', do: { chord: ['A', 'maj7'] }, more: 'A major (A C♯ E) plus the note a half step below A.' },
      { say: 'And D♭maj7.', do: { chord: ['Db', 'maj7'] }, more: 'D♭ major (D♭ F A♭) plus C.' },
    ],
  },

  'u1-swing': {
    title: 'Swing feel and the dominant seventh',
    steps: [
      { say: 'The same line straight, then swung. Swung eighths are long-short.', demo: [{ abc: LINE, bpm: 112, ride: true }, { abc: LINE, bpm: 112, ride: true, swing: true, accent: true }] },
      { say: 'Your turn: play it swung after the count-in.', do: { timed: LINE, bpm: 96, need: { swing: 0.6 } }, more: 'Feel each beat in three. The offbeat note lands on the third part.' },
      { say: 'Now lean on the offbeats: soft on the beat, strong off it. doo-VAH.', demo: [{ abc: LINE, bpm: 112, ride: true, swing: true }, { abc: LINE, bpm: 112, ride: true, swing: true, accent: true }] },
      { say: 'Your turn, offbeats louder.', do: { timed: LINE, bpm: 96, need: { swing: 0.6, accent: 0.6 } } },
      { say: 'Coordination Exercise 1, part 1: three notes per beat, weight on the third. You’ll play it next.', demo: { abc: '(3CCD (3EEF (3GGA (3BBc | (3ccB (3AAG (3FFE (3DDC |]', bpm: 84 } },
      { say: 'The dominant 7th: a major triad plus the note a whole step below the root. C7.', demo: { keys: [60, 64, 67, 70] }, do: { chord: ['C', '7'] } },
      { say: 'Cmaj7 to C7: only B moves, down to B♭. Play both.', demo: { chords: [['C', 'maj7'], ['C', '7']], start: [60, 64, 67, 71] }, do: { chain: [['C', 'maj7'], ['C', '7']], hints: 2, start: [60, 64, 67, 71] } },
      { say: 'G7.', do: { chord: ['G', '7'] } },
      { say: 'B♭7.', do: { chord: ['Bb', '7'] } },
      { say: 'E7.', do: { chord: ['E', '7'] } },
    ],
  },

  'u1-minor': {
    title: 'Minor sevenths and phrasing',
    steps: [
      { say: 'Minor 7th: a minor triad plus the note a whole step below the root. Cm7.', demo: { keys: [60, 63, 67, 70] }, do: { chord: ['C', 'm7'] } },
      { say: 'C7 to Cm7: only the 3rd drops, E to E♭.', demo: { chords: [['C', '7'], ['C', 'm7']], start: [60, 64, 67, 70] }, do: { chain: [['C', '7'], ['C', 'm7']], hints: 2, start: [60, 64, 67, 70] } },
      { say: 'Am7.', do: { chord: ['A', 'm7'] } },
      { say: 'F♯m7.', do: { chord: ['F#', 'm7'] } },
      { say: 'B♭m7.', do: { chord: ['Bb', 'm7'] } },
      { say: 'A phrase starting on the “and”: accent the first note, clip the last.', demo: { abc: 'z G A G E D C D | E2 z2 z4 |]', swing: true, accent: true, bpm: 112, ride: true } },
      { say: 'Your turn.', do: { timed: 'z G A G E D C D | E2 z2 z4 |]', bpm: 100, need: { swing: 0.6 } } },
      { say: 'An anticipation: the last offbeat of the bar ties over into the next.', demo: { abc: 'C E G A c B A G- | G2 E2 z4 |]', swing: true, accent: true, bpm: 112, ride: true } },
      { say: 'Your turn.', do: { timed: 'C E G A c B A G- | G2 E2 z4 |]', bpm: 100, need: { swing: 0.6 } } },
    ],
  },

  'u1-inversions': {
    title: 'The closest inversion, without counting from the root',
    steps: [
      { say: 'ii–V–I in C. Watch: the hand hardly moves.', demo: { chords: [['D', 'm7'], ['G', '7'], ['C', 'maj7']], start: [62, 65, 69, 72] } },
      { say: 'Each change keeps two notes and steps two down. Your turn: green keys stay.', do: { chain: [['D', 'm7'], ['G', '7'], ['C', 'maj7']], hints: 2, start: [62, 65, 69, 72] } },
      { say: 'The other shape: Dm7 with A at the bottom. Same moves.', demo: { chords: [['D', 'm7'], ['G', '7'], ['C', 'maj7']], start: [57, 60, 62, 65] }, do: { chain: [['D', 'm7'], ['G', '7'], ['C', 'maj7']], hints: 2, start: [57, 60, 62, 65] } },
      { say: 'In F: Gm7, C7, Fmaj7. Only the keys to keep light up now.', do: { chain: [['G', 'm7'], ['C', '7'], ['F', 'maj7']], hints: 1 } },
      { say: 'In B♭, no hints: Cm7, F7, B♭maj7.', do: { chain: [['C', 'm7'], ['F', '7'], ['Bb', 'maj7']], hints: 0 } },
      { say: 'Dominants around the circle: one note stays, three slide down.', demo: { chords: [['C', '7'], ['F', '7'], ['Bb', '7'], ['Eb', '7']], start: [60, 64, 67, 70] } },
      { say: 'Your turn: C7, F7, B♭7, E♭7, A♭7.', do: { chain: [['C', '7'], ['F', '7'], ['Bb', '7'], ['Eb', '7'], ['Ab', '7']], hints: 1, start: [60, 64, 67, 70] } },
    ],
  },

  'u1-spelling': {
    title: 'Spelling chords and the circle of fourths',
    steps: [
      { say: 'Chords use every other letter, so F♯maj7 is F♯ A♯ C♯ E♯. E♯ is the white key F.', demo: { keys: [66, 70, 73, 77] }, do: { chord: ['F#', 'maj7'] } },
      { say: 'D♭7 is D♭ F A♭ C♭. C♭ is the white key B.', demo: { keys: [61, 65, 68, 71] }, do: { chord: ['Db', '7'] } },
      { say: 'E♭m7: E♭ G♭ B♭ D♭.', do: { chord: ['Eb', 'm7'] } },
      { say: 'Bmaj7: B D♯ F♯ A♯.', do: { chord: ['B', 'maj7'] } },
      { say: 'G♯m7: G♯ B D♯ F♯.', do: { chord: ['G#', 'm7'] } },
      { say: 'Chords love to move up a fourth, so jazz practises keys around the circle of fourths. Listen.', demo: { chords: [['G', '7'], ['C', 'maj7'], ['C', '7'], ['F', 'maj7']], start: [65, 67, 71, 74] } },
      { say: 'Your turn, closest voicings.', do: { chain: [['G', '7'], ['C', 'maj7'], ['C', '7'], ['F', 'maj7']], hints: 1, start: [65, 67, 71, 74] } },
    ],
  },

  'u1-vamp': {
    title: 'Comping a vamp',
    steps: [
      { say: 'Comping: short chords behind a soloist. Four chords, each moving as little as possible.', demo: { chords: [['C', 'maj7'], ['A', 'm7'], ['D', 'm7'], ['G', '7']], start: [64, 67, 71, 72] } },
      { say: 'Your turn: Cmaj7, Am7, Dm7, G7.', do: { chain: [['C', 'maj7'], ['A', 'm7'], ['D', 'm7'], ['G', '7']], hints: 1, start: [64, 67, 71, 72] } },
      { say: 'For comparison, root position every time: hear the jumps.', demo: { chords: [['C', 'maj7'], ['A', 'm7'], ['D', 'm7'], ['G', '7']], root: true } },
      { say: 'Anticipation: each chord arrives on the “and” of 4, just before its bar.', demo: { abc: '"Cmaj7" [EGBc]2 z5 "Am7" [EGAc]- | [EGAc]2 z5 "Dm7" [FAcd]- | [FAcd]2 z5 "G7" [FGBd]- | [FGBd]2 z6 |]', swing: true, bpm: 100, ride: true } },
      { say: 'Your turn: play along.', do: { timed: '"Cmaj7" [EGBc]2 z5 "Am7" [EGAc]- | [EGAc]2 z5 "Dm7" [FAcd]- | [FAcd]2 z5 "G7" [FGBd]- | [FGBd]2 z6 |]', bpm: 92, need: {} } },
    ],
  },

  'u1-form': {
    title: 'The 12-bar blues',
    steps: [
      { say: 'The 12-bar blues in B♭: three phrases of four bars. Count the bars as it plays.', demo: { abc: '"Bb7" [DF_A_B]8 | "Eb7" [_D_EG_B]8 | "Bb7" [DF_A_B]8 | "Bb7" [DF_A_B]8 | "Eb7" [_D_EG_B]8 | "Eb7" [_D_EG_B]8 | "Bb7" [DF_A_B]8 | "Bb7" [DF_A_B]8 | "F7" [_EFAc]8 | "Eb7" [_EG_B_d]8 | "Bb7" [F_A_Bd]8 | "F7" [FAc_e]8 |]', bpm: 120, ride: true, swing: true } },
      { say: 'Your turn: the changes, closest voicings.', do: { chain: [['Bb', '7'], ['Eb', '7'], ['Bb', '7'], ['Eb', '7'], ['Bb', '7'], ['F', '7'], ['Eb', '7'], ['Bb', '7'], ['F', '7']], hints: 1, start: [62, 65, 68, 70] }, more: 'Bars 1–4 B♭7 E♭7 B♭7 B♭7, bars 5–8 E♭7 E♭7 B♭7 B♭7, bars 9–12 F7 E♭7 B♭7 F7.' },
      { say: '“Freddie Freeloader” ends each chorus its own way: F7, E♭7, A♭7.', demo: { chords: [['F', '7'], ['Eb', '7'], ['Ab', '7']], start: [60, 63, 65, 69] }, do: { chain: [['F', '7'], ['Eb', '7'], ['Ab', '7']], hints: 1, start: [60, 63, 65, 69] } },
    ],
  },

  'u1-listening': {
    title: 'Hearing the band',
    steps: [
      { say: 'The ride cymbal: ding, ding-a, ding, ding-a. Listen for the “a”.', demo: { abc: 'z8 | z8 |]', ride: true, bpm: 120 } },
      { say: 'Tap the “a” on any key: just after beats 2 and 4.', do: { timed: 'z2 z c z2 z c | z2 z c z2 z c |]', bpm: 108, ride: true, anyPitch: true, need: {} } },
      { say: 'Comping like Wynton Kelly: short chords, often just off the beat.', demo: { abc: '"Bb7" z [DF_A_B] z2 z [DF_A_B] z2 | "Eb7" z [_D_EG_B] z2 z [_D_EG_B] z2 |]', swing: true, bpm: 120, ride: true } },
      { say: 'Your turn: two short stabs a bar, on the offbeats.', do: { timed: '"Bb7" z [DF_A_B] z2 z [DF_A_B] z2 | "Eb7" z [_D_EG_B] z2 z [_D_EG_B] z2 |]', bpm: 108, ride: true, need: {} } },
    ],
  },

  'u1-review': {
    title: 'Unit 1 check-in',
    steps: [
      { say: 'Swing: long-short, offbeats leaning.', do: { timed: 'C D E G A G E D | C2 z2 z4 |]', bpm: 108, need: { swing: 0.6, accent: 0.6 } } },
      { say: 'F♯maj7.', do: { chord: ['F#', 'maj7'] } },
      { say: 'B♭7.', do: { chord: ['Bb', '7'] } },
      { say: 'E♭m7.', do: { chord: ['Eb', 'm7'] } },
      { say: 'ii–V–I in E♭, no hints: Fm7, B♭7, E♭maj7.', do: { chain: [['F', 'm7'], ['Bb', '7'], ['Eb', 'maj7']], hints: 0 } },
    ],
  },
};
