# Village Hustle

A hot-seat life-sim board game for the browser, for 2–8 players with optional computer opponents.
It is set in a small Finnish village. Each week you walk around, work, study, shop and rest, and the first player to reach all of their own life goals wins.

Every place has its own music and atmosphere, every action its own sound, and the shopkeepers babble as they talk. All of it is synthesized in the browser from small text recipes, so there are no audio files.

The exact rules are deliberately hidden. Players (and most of the team) never see the numbers. Balance is checked by bot simulations and an auto-tuner that report only metrics.

## Quick start

```sh
npm install
npm run dev        # play at http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload |
| `npm run build` | Type check and build a static site into `dist/` (host it anywhere) |
| `npm run preview` | Serve the built `dist/` locally |
| `npm test` | Unit tests (expression language, content validation, engine, audio) |
| `npm run validate` | Check every content file and print any errors |
| `npm run sim` | Play bot-only games and print balance metrics |
| `npm run tune` | Auto-tune balance parameters against the targets |
| `npm run diag` | Show where bots get stuck (game state only) |
| `npm run play` | Play a game in text mode, against bots or other players (used for AI-agent playtests) |
| `npm run art` | Regenerate the placeholder Ryttylä pixel art |
| `npm run audio` | Render the music, sound effects and voices to `audio-preview/` as WAV and check them |

## Where things are

| Path | Contents |
|---|---|
| `content/` | **The game itself**: locations, items, jobs, courses, events, goals, rules, AI hints, balance |
| `content/rules/*.ts` | Custom rule code, for anything JSON can't express |
| `public/themes/<id>/` | Graphics (`theme.json` plus PNGs) and audio (`audio.json`, songs). Swap these to reskin the game |
| `src/audio/` | Music and sound: synthesizer, song notation, sound effect recipes, browser player |
| `src/engine/` | Pure, deterministic rules engine (no DOM) |
| `src/ai/` | Computer players (also used by the simulator) |
| `src/sim/`, `src/tools/` | Simulator, tuner, validator and diagnostics (Node) |
| `src/ui/` | Browser UI (canvas map plus DOM panels) |
| `tools/gen-art.ts`, `tools/art/` | Generator for the placeholder art (map, buildings, interiors, owners) |
| `docs/` | Specs and guides |

## Documentation

- [docs/SPEC.md](docs/SPEC.md): game design and technical architecture, including the plan for network play.
- [docs/CONTENT-GUIDE.md](docs/CONTENT-GUIDE.md): how to add locations, items, jobs, rules, rule code and themes.
- [docs/BALANCING.md](docs/BALANCING.md): the game master's simulation and tuning workflow.
- [docs/AUDIO-GUIDE.md](docs/AUDIO-GUIDE.md): writing songs, sound effects and voices, and mapping them to game moments.

> **Spoiler warning:** `content/balance.json` contains the hidden numbers. Only the game master should open it. See BALANCING.md.
