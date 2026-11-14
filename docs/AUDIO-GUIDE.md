# Audio guide

Everything you hear in Village Hustle is **synthesized in the browser** from small text recipes:
the location music is JSON "sheet music" played by built-in virtual instruments, the sound
effects are short code recipes, and the hosts "talk" in a wordless babble. There are no audio
files to ship or license, the whole soundtrack is a few dozen kilobytes, and every part of it
can be edited with a text editor.

A theme can still use prerecorded files (OGG/MP3/WAV) wherever it likes; see
[Using audio files](#using-audio-files).

```
public/themes/<theme>/
  audio.json            which song plays where, which sound plays when, host voices
  audio/songs/<id>.json the songs
  audio/<anything>.ogg  optional prerecorded files
src/audio/
  synth/instruments.ts  the virtual instruments
  synth/ambience.ts     background atmosphere generators (birds, waves, café murmur...)
  synth/song.ts         the song notation (parser + compiler)
  synth/render.ts       mixes a song: effects, loop folding, mastering
  synth/sfx.ts          sound effect recipes
  synth/voice.ts        formant voice synthesis (host babble, "mm!", cheering)
  config.ts             audio.json format and validation
  player.ts             browser playback (crossfades, caching, volumes)
  worker.ts             renders audio in a background thread
```

## Quick start

```
npm run audio            render everything to audio-preview/ (WAV) and check it
npm run audio grill      only songs/effects whose name contains "grill"
npm run audio sfx        only the sound effects
npm run audio voices     only the host voice demos
npm run audio -- --twice write loops twice in a row, to listen to the loop point
```

The tool prints each song's length, peak and loudness, the **loop seam** (how big the jump at
the loop point is compared with the music around it; around 1 is invisible, above 3 is flagged;
a note that starts right on the loop point is not counted as a jump) and any warnings
from the song checker (wrong bar lengths, notes outside an instrument's range, melody notes
that clash with the chord...). Edit, re-run, listen to the WAV.

In the game, press **M** to mute; volumes for music, effects and voices are in the Menu.

## audio.json

```json
{
  "music": {
    "title": "title",
    "map": "map",
    "gameover": "title",
    "locations": { "grill": "grill", "bank": "bank" }
  },
  "sfx": {
    "ui.click": "click",
    "enter.grill": "shopbell",
    "item.grill_meal": "eat",
    "item.groceries": { "play": ["kaching", "bag"], "gap": 0.45 },
    "kind.jobs.hired": "hired"
  },
  "voices": {
    "grill": { "pitch": 100, "shift": 0.9, "buzz": 0.7 }
  },
  "volume": { "music": 0.55, "sfx": 0.8, "voice": 0.6 }
}
```

Every part is optional. Without an audio.json the game is silent.

### Music

`map` plays on the village map and while walking, each location plays its own song while its
panel is open, `title` on the title and setup screens, `gameover` on the final screen. A
location without a song keeps the map music. Songs crossfade, and each song **continues where
it left off** when you come back, so walking in and out of a shop doesn't restart its tune.

### Sound effects

A value is a sound effect name from `src/audio/synth/sfx.ts` (`npm run audio sfx` renders them
all to `audio-preview/sfx/`), a file name (anything containing a dot, relative to
`audio/`), a list played one after another (`["kaching", "bag"]`, 0.25 s apart), or
`{ "play": [...], "gap": seconds }`. An empty string means "silence here".

| Key | When |
|---|---|
| `ui.click` | Any ordinary button |
| `ui.denied` | Clicking a greyed-out choice |
| `walk.step` | Each footstep on the map |
| `enter.<location>` | Entering a location (door, bell...) |
| `turn.start` | A player's turn begins |
| `week.new` | A new week begins (instead of `turn.start`) |
| `msg.good`, `msg.bad` | The turn screen has good / bad news |
| `game.over` | The game ends |

Actions use the **most specific key that exists**, in this order:

1. `action.<location>.<action>.<outcome>` e.g. `action.grill.karaoke.bad`
2. `action.<location>.<action>` e.g. `action.sauna.swim`
3. `item.<option>.<outcome>` e.g. `item.lottery_ticket.good`
4. `item.<option>` (the chosen item/job/course id) e.g. `item.grill_meal`
5. `category.<item category>` e.g. `category.clothing`
6. `kind.<action kind>.<outcome>` e.g. `kind.jobs.hired`
7. `kind.<action kind>` e.g. `kind.shop`

The outcome is `hired`/`rejected` (job applications), `enroll`/`lesson`/`graduate` (courses),
otherwise `good` or `bad` when the action's messages were good or bad news.

### Voices

While a host's speech bubble types out, the host "talks" in Animal-Crossing-style babble: one
short sung syllable per few letters, whose vowel follows the text (so Finnish words get their
own melody), with clicks for p/t/k and hisses for s. Music dips slightly while someone talks.

| Field | Meaning |
|---|---|
| `pitch` | Voice pitch in Hz: men roughly 90-140, women 180-260 |
| `vary` | Intonation range in semitones (low = monotone) |
| `shift` | Vocal tract size: below 1 big/dark, above 1 small/bright |
| `breath` | 0..1 breathiness (older, softer voices) |
| `buzz` | 0 soft and round .. 1 buzzy and nasal |
| `len` | Syllable length multiplier |
| `volume` | Loudness multiplier |

`npm run audio voices` writes a short demo sentence for every voice.

## Writing a song

A song is a JSON file in `audio/songs/`. Its file name is its id.

```json
{
  "title": "Pea soup waltz",
  "bpm": 132,
  "meter": 3,
  "sections": { "A": 8, "B": 8 },
  "form": ["A", "A", "B", "A"],
  "reverb": { "size": 0.6, "wet": 1 },
  "master": { "loudness": -20, "warmth": 1.5 },
  "ambience": [{ "type": "crowd", "level": 0.7 }],
  "tracks": [
    { "inst": "accordion", "notes": { "A": "E5:1 D5 C5 | B4:2 A4:1 | ...", "B": "..." }, "rev": 0.25 },
    { "inst": "accordion", "chords": "Am | Dm | E7 | Am", "style": "waltz", "vol": 0.6, "pan": -0.3 },
    { "inst": "tuba", "chords": "Am | Dm | E7 | Am", "style": "waltzbass" },
    { "kit": { "brush": "x..", "rim": ".x." }, "vol": 0.5 }
  ]
}
```

### Song fields

| Field | Meaning |
|---|---|
| `bpm` | Tempo in beats per minute |
| `meter` | Beats per bar (default 4; 3 for waltzes) |
| `swing` | 0 straight .. 1 full triplet swing; `swingRes` 8 (default) or 16 |
| `transpose` | Semitones for all tonal tracks (try a key quickly) |
| `bars` | Length in bars when there are no sections |
| `sections`, `form` | Named sections with their length in bars, and the order they play in |
| `loop` | `false` for one-shot jingles; songs loop seamlessly by default |
| `reverb` | `size` 0..1, `damp` 0..1, `predelay` s, `wet`, `width` |
| `delay` | Ping-pong echo: `time` in beats, `feedback`, `wet`, `tone` (Hz) |
| `master` | `loudness` (dB, default -20; every song is levelled to it), `warmth` / `air` (dB of low/high shelf), `lofi` 0..1 (tape wobble, hiss, dust), `width` (stereo), `tail` (s) |
| `ambience` | Background atmosphere layers, see below |

**Loops:** the end of a looping song flows straight into its start; notes and reverb that ring
past the end wrap around to the beginning, so write the song as a cycle (the last bar may lead
back into the first) and don't leave an empty bar at the end. Aim for 40-70 seconds.

### Track fields

| Field | Meaning |
|---|---|
| `inst` | Instrument (below) |
| `notes` / `steps` / `chords` | The part, in one of three notations (below). A string, or `{ "A": "...", "B": "...", "*": "..." }` per section (`*` = any other section; a section with no part is silent) |
| `vol`, `pan` | Linear gain (1 default), pan -1..1 |
| `rev`, `dly`, `chorus` | Reverb send (default 0.2), delay send, stereo chorus amount |
| `style`, `range` | How `chords` are played (below), and the pitch range for them, e.g. `"G3-E5"` |
| `octave`, `transpose` | Shift this track |
| `humanize` | Timing looseness in ms (default 5, drums 2.5) |
| `vel`, `gate` | Velocity multiplier; note length factor (default 0.95; lower = staccato) |
| `roll` | Seconds between chord notes (strummed / rolled chords) |
| `swing` | Overrides the song swing |
| `opts` | Instrument parameters, e.g. `{ "t60": 5, "bright": 0.4 }` |
| `lp`, `hp` | Low-pass / high-pass cutoff in Hz to clean up the mix |
| `mute` | Turn the track off |
| `kit`, `mix` | A drum kit: `{ "kick": steps, "snare": steps }` with per-piece gains in `mix` |
| `res`, `pitch` | For `steps`: steps per beat (default 4), and the note pitch for pitched drums |

A part shorter than its section repeats to fill it (the checker warns if it doesn't divide
evenly), so a one-bar drum pattern or a four-bar chord loop is fine.

### Notation

**notes**: `pitch:duration` with durations in **beats**; a duration sticks until changed.

| | |
|---|---|
| `C4`, `F#5`, `Bb3` | Pitches (C4 = middle C), or MIDI numbers |
| `:1`, `:1/2`, `:3`, `:1/3`, `:1.5` | Durations in beats |
| `r` `.` `-` | Rest |
| `_` | Tie: lengthen the previous note |
| `C4+E4+G4` | Chord |
| `!`, `?`, `@0.6` | Accent, ghost note, explicit velocity (0..1) |
| `\|` | Bar line (checked: the bar must be full) |
| `[ ... ]*3` | Repeat |

**steps**: one character per step (`res` steps per beat): `x` hit, `X` accent, `o` soft,
`1`-`9` velocity, `.` or `-` rest. Spaces are ignored. `"x...x...x...x..."`

**chords**: chord symbols with sticky durations (default one bar): `"Am | Dm:2 G7:2 | C % | r"`.
`%` repeats the previous chord, `r` is no chord. Qualities: (major), `m`, `7`, `maj7`, `m7`,
`dim`, `dim7`, `m7b5`, `aug`, `sus2`, `sus4`, `6`, `m6`, `9`, `m9`, `maj9`, `add9`, `madd9`,
`7sus4`, `7b9`, `mmaj7`, `5`; slash basses `C/E`. Chords are voiced automatically with smooth
voice leading.

> **Durations stay sticky across bar lines.** In `"Am7:2 D7:2 | Gm7"`, `Gm7` lasts only 2 beats
> because it inherits the `:2` from before. After a split bar, give the next chord an explicit
> duration: `Gm7:4`. (The bar check warns when this leaves a bar short.)
> Bass styles always play the root when the chord changes in the middle of a bar.

**Styles** for `chords`:

| Chord styles | |
|---|---|
| `pad` | Held chords |
| `block` | A chord on every beat |
| `backbeat` / `waltz` | Off-the-one chords (beats 2 & 4, or 2 & 3 in 3/4): oom-**pah**, oom-**pah-pah** |
| `offbeat` / `skank` | Chords on the "and"s |
| `tango` | Marcato chords on every beat |
| `arp`, `arp16`, `arpud` | Arpeggios in 8ths, 16ths, up-and-down |
| `broken` | Alberti-style broken chords |
| `strum` | Guitar strums |
| `bossa` | Bossa nova comping |

| Bass styles | |
|---|---|
| `root`, `pedal` | One long root note per bar / per chord |
| `pulse`, `root8` | Root on every beat / every 8th |
| `rootfifth`, `oompah` | Alternating root and fifth (polka, humppa) |
| `waltzbass` | Root on beat 1, alternating with the fifth every other bar |
| `walk` | Walking bass that approaches the next chord |
| `habanera`, `tango332` | Latin / tango bass rhythms |

### Instruments

| Name | Sound | Useful `opts` |
|---|---|---|
| `kantele` | Bright ringing Finnish zither | `t60` (ring time), `bright`, `shimmer` |
| `guitar` | Nylon-string guitar | `t60`, `bright`, `damp` |
| `harp` | Soft long-ringing harp | `t60`, `bright` |
| `bass` | Plucked upright bass | `t60`, `bright` |
| `ebass` | Round electric bass | `cutoff`, `release` |
| `vibes` | Vibraphone with tremolo | `trem`, `t60` |
| `glock`, `marimba`, `musicbox`, `bell` | Mallets and bells | `t60`, `click`, `damp` |
| `felt` | Soft felt piano | `decay`, `bright`, `pedal` |
| `epiano` | Electric piano (Rhodes-like) | `bark`, `trem`, `decay` |
| `organ` | Drawbar organ | `b16`, `b8`, `b4`, `b223`, `b2`, `rotary`, `click` |
| `accordion` | Musette accordion | `detune`, `reeds`, `bright`, `low` |
| `pad`, `strings`, `choir` | Sustained pads | `attack`, `release`, `cutoff`, `detune`, `vibrato`; choir `vowel` |
| `flute`, `whistle`, `reed` | Winds | `breath`, `chiff`, `vibrato`, `vibHz`, `vibDelay` |
| `brass`, `tuba` | Brass | `bright`, `scoop`, `vibrato`, `detune` |
| `lead` | Soft pulse-wave synth | `pw`, `cutoff`, `vibrato` |
| `kick`, `snare`, `brush`, `hat`, `ohat`, `crash`, `rim`, `clap`, `shaker`, `tamb`, `block`, `clave`, `snap`, `triangle` | Drums (pitch them with `opts.tone`) | `tone` |
| `tom` | Pitched tom (plays the note's pitch) | |

Each tonal instrument has a range; the checker warns about notes outside it.

### Ambience

Atmosphere layers under the music, generated to loop seamlessly with it:
`"ambience": [{ "type": "birds", "level": 0.8, "rate": 1, "pan": 0, "rev": 0.3 }]`

| Type | Sound | `opts` |
|---|---|---|
| `birds` | Songbirds | |
| `cuckoo` | A distant cuckoo | |
| `loon` | A loon's wail across the lake | |
| `waves` | Lake waves lapping | |
| `wind` | Wind in the trees | |
| `fire` | Wood fire / sauna stove | |
| `crowd` | Café / pub murmur with cups and laughs | `people`, `clinks`, `laughs` |
| `clock` | Wall clock ticking | `period` (s) |
| `hum` | Fluorescent light hum | |
| `beeps` | Checkout scanners | |
| `train` | A train passing, platform chime | `chime` (0 = none) |
| `pages` | Library: pages, pencil | |
| `machines` | Factory: press synced to the beat, drone, steam | `press` (beats between thumps) |
| `grasshoppers` | Summer meadow crickets | `count` |
| `typing` | Office keyboards | |
| `rain` | Rain on a roof | |

`level` scales loudness, `rate` the number of events, `pan` the position, `rev` the reverb send.
Generator settings such as `period` go inside `opts`; anything else is ignored.

Levels are **relative to the music**: the renderer scales ambience by how loud the song's
instruments are before the final loudness normalization, so `"level": 1` sits about the same
under a quiet lullaby as under a loud polka. Around 1 is a clearly audible bed. Use 0.3–0.6 for
background colour and 1–1.5 when the place itself is the point (a lake, a factory floor).

## Sound effects

Effects are recipes in `src/audio/synth/sfx.ts`, built from a few ingredients: filtered noise,
tones with pitch curves, struck objects (inharmonic partials), dense "grains" (crunch, gravel,
paper), the formant voice ("mm!", "aah", a yawn), notes from the instruments, and short jingles
written in the song notation. Each effect can have several random variants, so footsteps and
coins never sound copy-pasted. To add one, copy a similar recipe, give it a new name, and
reference it from audio.json.

## Using audio files

Anywhere a song or effect is expected you can use a file instead:

```json
"music": { "locations": { "grill": { "file": "music/grill.ogg" } } },
"sfx": { "item.grill_meal": "sounds/burp.ogg" }
```

Paths are relative to the theme's `audio/` folder. Music files loop as a whole, so cut them to
loop cleanly.

## How it works

- Rendering happens in a background worker, so the game never stutters. The title and map
  songs and all effects are prepared while the title screen is up; a location's song starts
  rendering when you hover over it or start walking there.
- Browsers only allow sound after the first click or key press, so music starts then.
- Rendered songs are kept in a small cache (a few songs); the rest are re-rendered when needed.
  Rendering is deterministic, so a song always sounds the same.
- Songs are levelled to the same loudness and run through a limiter. Effects are normalized
  per recipe, and the final mix has a gentle safety compressor.
