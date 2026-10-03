# Jazz Piano Coach

A self-contained, 30-minute-a-day jazz piano course. Topics follow the order of Jeremy Siskind's
*Jazz Piano Fundamentals, Book 1*; the lessons and exercises are written for this app. Each day is a short
lesson (text, notation you can hear, keyboard diagrams, "play it now" checks) followed by drills that listen
to your digital piano over MIDI, plus gates that show when you're ready to move on.

## What's in it (Unit 1 so far)

- **Lessons**: eight short lessons covering practice habits, drone improvisation, swing feel, the three
  essential seventh chords, chord spelling, the circle of fourths, comping and voice leading, song form and the
  12-bar blues, and how to listen. Notation is written in ABC (`js/content/`) and drawn with abcjs.

- **Chord flash cards**: maj7, 7 and m7 in all 12 keys. Play the chord in any inversion. Each card is timed and
  the slow ones come up more often. Gate: all 36 under 3 seconds.
- **Spell the chords**: write the notes with correct letter names (F♯maj7 = F♯ A♯ C♯ E♯).
- **Coordination Exercise 1** in any key. Part 1 is repeated-note triplets; part 2 is swung eighths. Each take is
  checked note by note against a count-in, then for swing placement (where offbeats land in the beat), offbeat
  accent ("doo-VAH") and legato. Gate: part 2 passes in all 12 keys at ♩ = 100 or faster.
- **Swing check**: five short written swing exercises (or free play) over a ride cymbal, checked note by note,
  with a ruler showing where your offbeats land.
- **Vamp**: four random chords over bass and drums, from 2 bars down to 1 beat each.
- **Drone improvisation**: timed sessions with one focus at a time (listening, phrases, rhythm), plus a
  read-back of your phrases, silence and rhythmic variety.
- **Guided listening**: a form follower for "Freddie Freeloader" (who's soloing, which chorus, which bar of
  the blues) and a short form quiz.

Progress is stored in the browser (export/import in Settings). The Feedback button (or `F`) lets you pick
any element on the page and leave a note.

## Run locally

```bash
python3 serve.py
```

Opens http://localhost:8643 in Chrome (Web MIDI needs Chrome or Edge). No build step; plain ES modules.

## Deploy

The server container pulls `main` from GitHub every minute (`deploy/autodeploy.sh`) and installs it with
`deploy/install.sh`: nginx serves the static site, a tiny Python service stores feedback notes, and a
Cloudflare Tunnel publishes it. `deploy/deploy.sh` triggers a deploy immediately after a push.
`tools/feedback.py` pulls feedback notes from the server.

## Adding units

`js/curriculum.js` holds the units, their days (steps with drill configs) and gates. Lessons and written
exercises live in `js/content/`. Drills live in `js/drills/`, each exporting `mount(ctx)` and returning
`{ noteOn, noteOff, onSpace, destroy }`.
