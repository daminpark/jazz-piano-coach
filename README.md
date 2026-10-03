# Jazz Piano Coach

A 30-minute-a-day practice companion for Jeremy Siskind's *Jazz Piano Fundamentals, Book 1* (2021).
It turns each unit into daily sessions with drills that listen to your digital piano over MIDI and test you,
plus gates that show when you're ready to move on.

The app doesn't reproduce the book. Read each unit there; the app generates its own exercises (scales, chords,
patterns), refers to the book by page, and points you to the recordings on your streaming service.

## What's in it (Unit 1 so far)

- **Chord flash cards**: maj7, 7 and m7 in all 12 keys. Play the chord in any inversion. Each card is timed and
  the slow ones come up more often. Gate: all 36 under 3 seconds.
- **Spell the chords**: write the notes with correct letter names (F♯maj7 = F♯ A♯ C♯ E♯).
- **Coordination Exercise 1** in any key. Part 1 is repeated-note triplets; part 2 is swung eighths. Each take is
  checked note by note against a count-in, then for swing placement (where offbeats land in the beat), offbeat
  accent ("doo-VAH") and legato. Gate: part 2 passes in all 12 keys at ♩ = 100 or faster.
- **Swing check**: play the book's Swing Exercises over a ride cymbal and see where your offbeats land.
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

`js/curriculum.js` holds the units, their days (steps with drill configs) and gates. Drills live in
`js/drills/`, each exporting `mount(ctx)` and returning `{ noteOn, noteOff, onSpace, destroy }`.
