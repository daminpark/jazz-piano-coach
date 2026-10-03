// Swing exercises written for this app: short C-major lines that put eighth notes in different places
// (starting on the beat, on the offbeat, after rests, tied across the bar, repeated notes).
// ABC notation, L:1/8. Play them swung: long-short, with the weight on the offbeat.
export const SWING_EXERCISES = {
  A: { title: 'On the beat', focus: 'Starts on beat 1. Keep the line legato and lean on every offbeat.',
    abc: '"C" C D E G A G E C | D2 z2 z4 | E F G A c A G E | G2 C2 z4 |]' },
  B: { title: 'Off the beat', focus: 'Every phrase starts on the “and” of beat 1. The first note is an offbeat, so accent it.',
    abc: 'z G A G E D C D | E2 z2 z4 | z c B A G E D E | C4 z4 |]' },
  C: { title: 'After the rest', focus: 'Long rests, then phrases that start mid-bar. Count the rests in triplets so you come in swinging.',
    abc: 'z4 E F G A | B c A G E2 z2 | z2 z D E G A c | B2 G2 z4 |]' },
  D: { title: 'Anticipations', focus: 'The last eighth of bars 1 and 3 is tied over the bar line. It arrives early: accent it and hold it.',
    abc: 'C E G A c B A G- | G2 E2 z4 | D F A c B A G E- | E4 z4 |]' },
  E: { title: 'Repeated notes', focus: 'Repeated notes stay legato: let the key come only partway up before playing it again.',
    abc: 'E E G E c B G E | A2 A2 z4 | z D F A c c B A | G4 z4 |]' },
};
