# Village Hustle: specification

Status: playable prototype with placeholder art. This file is the source of truth for *what* the game is and *how* it is built. For day-to-day content work, see [CONTENT-GUIDE.md](CONTENT-GUIDE.md). For balance, see [BALANCING.md](BALANCING.md).

## 1. Goals of the project

| Requirement | How it is met |
|---|---|
| An original browser game in the "life-sim board game" genre | Own setting (a Finnish village), own locations, rules, text and art. Nothing is taken from any existing game. |
| Rules that feel like a black box, yet are reasonably balanced | Players never see the numbers. Balance comes from bot simulation and an auto-tuner that report only metrics. Optional per-game randomization of the numbers. |
| Everything configurable | All rules, numbers, places, items, jobs, courses, events, goals and AI hints are content files under `content/`. Anything JSON can't express goes in rule code (`content/rules/*.ts`). |
| Hot-seat for 2–8 players, network play later | Pure deterministic engine with serializable state and actions, plus a `GameSession` seam in the UI (see §6). |
| Retro pixel art, replaceable | Themes are data plus PNGs under `public/themes/<id>/`. The engine knows nothing about graphics. |
| English, polished, easy to iterate | Hot-reload dev server, validator with file-specific errors, unit tests, simulator. |

## 2. Game design

### 2.1 Overview
- Each player starts as a young adult living with their parents in a small Finnish village.
- Before the game, the players set target levels (10–100) for each **goal**: Wealth, Happiness, Education and Career.
- A player wins by **keeping every target through the weekend**: goals are checked at the start of their next week, not the moment they are reached. The other players then finish that round as their last chance. If several players qualify in the same round, the one furthest past their targets wins. If nobody manages it by the week limit, the player with the most overall progress wins. (`game.winCheck: "immediate"` restores the old instant win.)
- The best jobs have limited openings: only one player at a time can hold each top position. Managers need experience from their own workplace. There is only one cottage for sale.
- The Happiness goal averages current happiness with last week's, so a good mood has to last; Wealth subtracts unpaid rent.
- **Every goal has more than one route** (see 2.4, "Routes to the goals"). School → better job → money is one way to win, not the only one.

### 2.2 Turns
- A **week** is one turn for every player, in seat order (hot-seat).
- A turn starts at the player's home with a weekly budget of **hours**, which is lower when the player is in poor health.
- **Upkeep runs at the start of each turn**, from the second week on:
  - items age and wear out
  - food is eaten; going hungry hurts
  - rent becomes due
  - stress, health and happiness drift
  - savings earn interest
  - a random event may happen
- During a turn the player:
  - **walks** between places, which costs hours by distance (a bicycle makes it cheaper). A player may set off for any place, even without enough time left: the week then runs out on the way, they get there as everything closes, and the week ends.
  - **does things** at the place they're at, which costs hours and often money
- Players never see exact hours: walks and actions show as *quick*, *takes some time* or *takes a lot of time* (hourglass icons), and the time left in the week is a bar.
- The turn ends when the player chooses to. Running out of hours does not end it by itself: the player stays where they are, can read what happened, and heads home when they leave the place (the token dashes home quickly). The map darkens towards evening as the hours run out.
- The calendar starts in early June; seasons change every 13 weeks. Seasons recolour the map, bring weather, and change which random events can happen.
- After everyone has played, a world update runs. It moves the economy index, which affects prices and wages, and the share market.

### 2.3 Places (default content)

| Place | Purpose |
|---|---|
| Parents' House | Start home: free food, but Mom's chores take time and happiness every week. Visitors can have soup. |
| Lasitehtaantie Flats | Rent the cheap, gloomy basement or the proper one-room flat. Rent is monthly, at the rate locked in by the lease. |
| Red Cottage | Rent it or buy it. Passive happiness; the best rest. |
| Työkkäri (employment office) | Job listings, career counselling, quitting, case-worker job. |
| Savings Bank | Deposit, withdraw (cash on hand can be stolen), buy and sell shares, jobs. |
| Sale (village shop) | Groceries, coffee, scratch cards, jobs. |
| Vanha Trokari (pizza & kebab grill) | Meals and coffee, karaoke, mölkky, entry-level jobs. |
| Kolmilammi Dance Pavilion | Weekly dance night and ice cream; leisure. The house band hires singers who have proved themselves at karaoke. |
| Hardware & Home | Clothes (dress codes gate jobs), appliances, bicycle, computer; flea-market selling. |
| Health Station | Doctor, flu shot, nursing courses and jobs. |
| Ryttylä School (evening classes) | Courses that grant degrees; skills tests (näyttö) that turn work experience into a diploma. |
| Village Library | Reading and self-study, library jobs. |
| Ykslammi Beach | Sauna, swim, sausage; leisure and stress relief. The beach kiosk can be leased and run as your own business. |
| Furniture Factory | Odd jobs and industrial career path. |
| Ryttylä Station | Commuter jobs in Helsinki (long shifts, high career), day trips. |

Every place has an **owner** (host) who appears in the interior picture and comments on what the player does in cartoon speech bubbles. The setting is a fictionalised Ryttylä (Hausjärvi, Finland). The place names are inspired by the real village; the people are invented.

### 2.4 Systems
- **Jobs** have a career rating, a wage, a shift length, requirements (degrees, clothing, experience) and an optional promotion target. Requirements are hidden: anyone may apply for any job, and an unqualified application wastes the application time and is rejected with the reason.
- **Raises and promotions**: shifts worked in the same job are counted. Every so many shifts brings a raise (higher wage, a little career score), up to a top pay grade. After enough shifts, a job with a next step can lead to a promotion (reputation and luck help). If the player does not qualify yet, the boss says once what is missing. Changing jobs starts the count again.
- **Routes to the goals**:
  - *Career*: study for a better job; or stay and work your way up (raises, promotions; most manager posts accept long experience at that workplace instead of the diploma); or buy your own business (the beach kiosk: busy summers, slow winters); or sing your way in (karaoke nights and a known name get you into the dance band, which leads to bandleader).
  - *Education*: courses; or skills tests at the school that turn workplace experience into vocational diplomas for a fee; and self-taught knowledge (reading, self-study, Olli) also counts.
  - *Wealth*: wages and savings; or shares (better average growth than savings, but they can crash); or property (the cottage holds its value, and earns holiday rent if the owner lives elsewhere); or the kiosk lease, which keeps part of its value.
  - *Happiness*: leisure, a nicer home, furnishings, the band job.
- **Food**: living at home with Mom, eating out (grill, Mom's soup when visiting) or cooking at home, which needs a hot plate. Groceries without one go to waste.
- **No hand-holding**: actions are rarely blocked outright. Repeating something in the same week usually still works, just worse (and often with a funny message). The game doesn't warn before the weekend about forgotten chores.
- **Furnishings**: decor and appliances bought for your own place appear in its interior and make it nicer to live in.
- **Education**: courses cost a fee and take several lessons; finishing one grants a degree. Degrees give education points and unlock jobs and further courses.
- **Items**: consumables (meals, groceries), clothing (tiered dress code, wears out), appliances (passive benefits) and property (the cottage deed counts towards wealth).
- **Hidden stats**: stress, reputation, knowledge, experience and others. They shape outcomes without being shown.
- **Leisure fatigue**: repeating leisure activities in one week gives diminishing returns.
- **Hedonic adaptation**: high happiness fades faster, so it has to be maintained.
- **Events**: one random event may hit a player at the start of a turn. Each event's weight depends on the situation (e.g. stress raises flu risk).
- **Economy index**: a random walk around a baseline that scales prices and wages.
- **Share market**: each week the world update picks one market move for everyone (noise, a small upward drift, a link to the economy, and rare booms and crashes). Shares are a stat whose value moves with it.

### 2.5 Hidden rules and randomization
- All numbers live in `content/balance.json` (the "parameters").
- When *Shuffle the rules a little* is on (the default), every parameter with a `vary` setting is randomly perturbed at game start. Each game then behaves slightly differently, and knowledge from one game transfers only roughly.
- The perturbed values are stored in the game state, so saves and replays stay consistent.

### 2.6 Computer players
- Bots use the same actions as humans, through the engine's public API.
- They choose greedily by "value gained per hour". To do that they simulate each option on a cloned state, with a scrambled RNG so they can't peek at random outcomes.
- **Value** combines:
  - each goal's progress, weighted per profile
  - career potential: guaranteed tenure plus jobs the bot qualifies for
  - partial credit for courses in progress
  - "needs" from `content/ai.json` (eat, pay rent, keep clothes, etc.)
- Two-step plans: an option blocked only by cash can be planned as "withdraw savings first".
- **Profiles** in `content/ai.json` (balanced, money-minded, bookworm, careerist, fun-lover, unpredictable) change goal weights, caution and randomness.

## 3. Architecture

```
content/ (JSON + rule code)          public/themes/<id>/ (theme.json + PNG)
        │                                         │
        ▼                                         ▼
src/engine  ── pure, deterministic ──►  src/ui  (canvas map + DOM panels)
        ▲                                         │
src/ai (bots) ◄─────────────────────────── uses ──┘
        ▲
src/sim + src/tools (Node: simulator, tuner, validator, diagnostics)
```

### 3.1 Engine (`src/engine`)
- **No DOM, no globals, no `Math.random`.** Every function takes `(content, state, ...)`.
- `createGame(content, setup)` returns `{state, events}`. `applyAction(content, state, action)` returns `{state, events}` and clones the state unless `{mutate: true}`.
- `listOptions` lists the available actions with reasons when they are disabled. `goalScores` and `overallProgress` compute goal scores and progress.
- **Actions** are `move`, `do` (location action plus option) and `endTurn`. They are plain JSON.
- **State** is plain JSON: players, week, world, rolled parameters, RNG state. It round-trips through `JSON.stringify` (tested).
- **Events** describe what happened: `message`, `moved`, `did`, `turnStarted`, `turnEnded` (with the `path` walked home), `weekEnded`, `gameOver`. The UI animates and logs from these.
- **Content loading** (`buildContent`) validates every file with zod and compiles every expression. It checks references (unknown parameters, items, jobs, nodes, functions) and reports them with file names. It also computes a content hash.
- **Expressions**: a small safe language with no access to JavaScript. See CONTENT-GUIDE §3.
- **Effects**: a JSON effect language. See CONTENT-GUIDE §4.
- **Rule modules**: TypeScript in `content/rules/` that add functions, effects and hooks (CONTENT-GUIDE §6).

### 3.2 UI (`src/ui`)
- A fixed **640×360 logical stage**, scaled by CSS transform (integer scale when possible). The map is a pixelated `<canvas>`; panels and dialogs are DOM with a pixel font (VT323).
- **Theme loading** (`theme.ts`):
  - places sprites from `theme.json` coordinates, builds hover outlines, tints the player token per player colour, and sets UI colours as CSS variables
  - a location without art falls back to a signpost, so new content works before its art exists
- **Location scene** (`host-scene.ts`): the interior picture, the animated owner sprite (idle / talk / happy / annoyed), regulars (extras), the player's own furniture when it is their home, clickable props (content `pokes`), and a typewriter speech bubble placed above whoever speaks. `app.ts` decides what the owner says from `location.host.lines`, `say` effects and the tone of the action's messages. Other messages appear as narration captions.
- **Map** (`map-view.ts`, `season.ts`): seasonal recolouring of the map art, snow / leaves / petals, and a daylight tint that follows the hours left in the week.
- **HUD**: the week and season, time left (a bar), cash, goals reached, the food icon, and the buttons. The buttons never shrink, so End week is always reachable. The other status icons from `game.json` `hud` are listed in the Status window, whose button lights up on a warning.
- **Stars instead of numbers**: goals are stars (one star is a fifth of the scale, in half steps). Each goal shows as many stars as its target, filled from a snapshot taken at the start of the turn, so a single choice's effect isn't directly visible. Happiness and health in the Status window are stars too. Only money and wages are exact. The game-over screen shows exact bars.
- **Screens**: title, how to play, setup (players, AI, goals, randomize, seed), game (HUD, map, location panel, status, goals, news, menu), turn hand-off, game over.
- **Autosave** goes to `localStorage` after every action and is tagged with the content hash. An outdated save is detected and not loaded.
- **AI turns** run in the UI with selectable speed. The animation is driven by the same events.

### 3.3 Tools (`src/sim`, `src/tools`, `tools/`)
- **Simulator**: bot-only games on worker threads, then aggregate metrics compared against `content/balance-targets.json`.
- **Tuner**: hill climbing over parameters that have a `tune` range. It uses common random numbers (all candidates are played on the same seeds) and writes values back to `balance.json`, keeping a backup.
- **Diagnostics**: per-player game state and the bot's ranked options at a given week.
- **Routes report** (`npm run paths`): counts which routes bots took (final jobs, raises, promotions, skills tests, shares, kiosk, band, a let cottage) to spot dead or dominant paths. Prints counts only.
- **Validator**: loads the content and prints errors.
- **Text play** (`npm run play`, `src/tools/play-cli.ts`): a game saved under `playtest/` that people or AI agents play one command at a time. It shows only what the UI shows (visible stats, option lists, owner lines, news) and lets bots take their turns automatically. It is used for playtesting the hidden rules without revealing them.
- **Art generator** (`tools/gen-art.ts` + `tools/art/`): draws the placeholder Ryttylä theme procedurally in a 16-bit, 3/4 top-down style. `map.ts` covers the map, buildings, overlays and player; `rooms.ts` covers the interiors and owners; `types.ts` is the contract between them; `preview.ts` writes enlarged previews.
- **Audio tool** (`npm run audio`): renders songs and sound effects to WAV, reports loop seams, levels and render times, and checks `audio.json`.

### 3.4 Audio (`src/audio`)
Everything you hear is synthesized in code. There are no recorded samples. Full reference: [AUDIO-GUIDE.md](AUDIO-GUIDE.md).
- **Synth** (`synth/`): pure TypeScript DSP that runs the same in the browser and in Node.
  - Instruments: kantele, accordion, guitar, harp, upright bass, mallets, organ, choir, a drum kit and others.
  - Ambience beds: birds, cuckoo, loon, waves, fire, rain, crowd, train, sawmill machines, typing and others.
  - A compact text notation for songs (notes, chords with accompaniment styles, drum steps, sections).
  - Procedural sound effects and short jingles.
  - Speech "babble" blips for the location owners.
  - Rendering is deterministic, so the same song always produces the same audio.
- **Songs** live in `public/themes/<id>/audio/songs/*.json`, one atmosphere per location plus title and map. They are rendered as seamless loops and normalized to a common loudness.
- **`audio.json`** (per theme) maps screens and locations to songs, game events to sound effects, and owners to voices. Action sounds are looked up from the most specific key to the least specific: location action → item → item category → action kind. A missing key means silence, so content works without audio.
- **Player** (`player.ts`):
  - Rendering runs in Web Workers (`worker.ts`), with a main-thread fallback.
  - Songs crossfade and resume where they left off. The next likely song is prefetched on hover and while walking.
  - Effects get small random variations. Voices duck the music.
  - Music, effects and voice volumes and mute are stored in `localStorage`. **M** toggles sound, and the Menu has sliders.
- The engine knows nothing about audio. The UI turns engine events into cues.

## 4. Content model (summary)

| File | Contents |
|---|---|
| `game.json` | Title, theme id, currency, player limits, turn time and travel time formulas, start state, week limit, intro text |
| `stats.json` | Player stats (visible or hidden, min/max) |
| `goals.json` | Goals and their score formulas, plus default targets |
| `map.json` | Walkable graph: nodes and weighted edges |
| `locations/*.json` | One file per place: actions of kinds `basic`, `shop`, `jobs`, `work`, `courses`, `transfer`, `sell` |
| `items.json`, `jobs.json`, `education.json`, `events.json` | Catalogues |
| `rules.json` | Upkeep and hooks: `turnStart`, `weekEnd`, `afterWork`, `afterLesson`, `afterMove`, plus advice hints |
| `balance.json` | All numbers (hidden), with randomization and tuning ranges |
| `balance-targets.json` | What "balanced" means, in metrics |
| `ai.json` | Bot needs and profiles |
| `rules/*.ts` | Rule code |

## 5. Determinism
- All randomness comes from the RNG stored in `state.rng`, through `ctx.random()` and the `rnd()` / `randInt()` expressions.
- The same content, setup, seed and action sequence always produce identical states (tested).
- This underpins saves, replays, bug reports ("seed plus actions"), the simulator, and network play.

## 6. Network play (planned, not built)
- The UI talks to the game only through the `GameSession` interface (`src/ui/session.ts`): `state`, `log`, `submit(action)`, `dispose()`.
- Hot-seat uses `LocalSession`. A networked version would add a `RemoteSession` with the same interface. The plan:
  1. **Authoritative server** (recommended): a Node process runs the same engine and content. Clients send `Action`s and the server validates them with `applyAction` and broadcasts the resulting `events` and the new state (or only a state hash plus events). This works for hidden rules because only the server needs `balance.json`. That fits the black-box design, since a client could be prevented from reading the numbers at all.
  2. Alternative, **lockstep peer-to-peer**: every client runs the engine and exchanges only actions; determinism keeps them in sync. Simpler to host, but every client has the content and the numbers.
- What is already in place:
  - serializable actions and state
  - per-player ids on every action, with "not your turn" rejection
  - events as the only UI input
  - a content hash for version checks between client and server
- Still to do: lobby and seat assignment, reconnect (send a state snapshot), and per-player visibility of private messages (events already carry the `player` id).

## 7. Non-goals and known limitations
- No mobile layout beyond scaling the 640×360 stage.
- No sound yet.
- The bots are greedy one-step planners, plus "withdraw first" plans. They are good enough for balancing and as opponents, but they can't plan long multi-step strategies.
- The placeholder art is procedurally generated. Replace it with company art through a new theme.
