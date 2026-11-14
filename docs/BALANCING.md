# Balancing guide (for the game master)

The game is fun because players don't know the exact rules. To keep that true for the whole team, **one person (the game master) owns the numbers**. Everybody else, including content designers and AI assistants, works only with metrics.

## The black-box workflow

| Who | Sees | Does |
|---|---|---|
| Game master | `content/balance.json` | Sets parameter values, `vary` (per-game randomness) and `tune` ranges; runs the tuner |
| Content designers | Metrics only | Add content using `params.name` references; ask the game master to add numbers |
| Everyone | `npm run sim` output | Reads metrics, never parameter values |

- The tools are built for this. `sim`, `tune` and `diag` print **metrics and the names of changed parameters with ↑/↓ arrows, never values**.
- Tip: keep `balance.json` out of normal code review. For example, review only its diff stats, or have the game master commit it separately.

## 1. Targets: what "balanced" means

`content/balance-targets.json` defines the targets:

| Target | Meaning |
|---|---|
| `games`, `players`, `randomizeBalance` | Default simulation setup |
| `goals` (optional) | Goal targets used in simulations; default is each goal's `defaultTarget` |
| `medianWeeks` | Typical game length range |
| `unfinishedRate` | Share of games that hit the week limit (nobody reached all goals) |
| `maxProfileWinRatio` | The best strategy's win share ÷ fair share. Keeps any single strategy from dominating |
| `comebackRate` | Share of games won by someone who wasn't leading early. Keeps the game from being decided too soon |
| `hungryWeeksPerPlayerWeek`, `evictionsPerGame` | "Punishment" mechanics should be rare in sensible play |
| `unusedLocations` | Every place should matter |

Edit these to match the game you want. Everything below optimises toward them.

## 2. Simulate

```sh
npm run sim                       # targets' default setup, all CPU cores
npm run sim -- --games 200        # more games, more confidence
npm run sim -- --players 2 --profiles balanced,tycoon
npm run sim -- --no-randomize     # base values only
npm run sim -- --verbose          # one line per game
```

**The report shows:**
- game-length distribution and time-limit rate
- comeback rate
- hunger and eviction rates
- **wins by strategy** (bot profiles from `content/ai.json`)
- average final goal scores
- **location usage** and **rarely used actions**
- a **target check** with the loss (0 = all targets met)

**How to read it:**

| Symptom | Likely cause |
|---|---|
| One strategy wins far too often | The goal that strategy favours is the bottleneck (too hard), or its path is too efficient |
| Many games hit the time limit | Something blocks progress. Run `npm run diag` |
| A location is unused | Its actions are too weak or too expensive, or bots don't understand them (add an `ai` hint or a need in `ai.json`) |
| One goal's average is far below the others | That goal sets the game length; adjust its scale or sources |

## 3. Diagnose

```sh
npm run diag -- --games 4 --at 40
```

- Prints every bot's goal progress, job, home and degrees at week 40 and at the end.
- Also prints the bot's ranked options at that moment.
- Use it when games stall. It shows *why* bots stop progressing (e.g. "no option to enrol in the next course", "work is worth almost nothing").

Some stalls are bot limitations rather than balance problems. The bots plan only one step ahead (plus "withdraw savings first"). If a sensible human path exists that bots miss, improve the bot (`src/ai/bot.ts`) or add an `ai` hint rather than changing the numbers.

## 4. Auto-tune

```sh
npm run tune                                   # all parameters with a "tune" range
npm run tune -- --iterations 40 --games 40
npm run tune -- --only rentFlat,wageScale      # limit the search
npm run tune -- --dry                          # don't write anything
```

- **Method:** stochastic hill climbing. Each iteration nudges a few tunable parameters, plays the same seeded games, and keeps the change if the loss drops.
- **Output:** loss per iteration and, at the end, which parameters went ↑ or ↓.
- **Saving:** results are written back into `balance.json` in place. The previous file is kept in `.sim-cache/balance-<timestamp>.json`, which is ignored by git.
- **Cost:** each iteration plays `--games` full games. Expect minutes, not seconds.

**Guidelines:**
- Give only the *structural* knobs a `tune` range: scales, prices of key items, fatigue, decay. Don't tune flavour numbers.
- Keep tune ranges sensible. The tuner will happily push a value to an extreme if that meets a metric.
- Re-run `npm run sim` with a different seed (`--seed x`) after tuning, to check the improvement isn't overfitted to the tuning seeds.
- Tuning with `randomizeBalance: true` (the default) finds values that work across the per-game variation.

## 5. Per-game randomization

- In `balance.json`, `"vary": 0.15` lets a parameter move by up to ±15% at the start of each game, when the "Shuffle the rules a little" setup option is on (the default).
- Use `vary` on prices, wages and rewards so players can't memorise exact values.
- Keep it off for structural limits and thresholds whose variation would feel like a bug.

## 6. Playtest in text mode

Bots plan one step ahead and use only what `ai.json` tells them. They don't look for exploits or say whether something is fun. `npm run play` lets a person, or an AI agent that has not seen the rules, play a real game one command at a time:

```sh
npm run play -- new duel --seats "Ada:player,Bo:player"          # two players
npm run play -- new solo --seats "Ada:player,Bo:bot:balanced"   # against a bot
npm run play -- look duel --as Ada                               # status, goals, news, where you can go
npm run play -- menu duel --as Ada grill                         # what a place offers, before walking there
npm run play -- act duel --as Ada "go grill; 2; end"             # several steps, separated by ;
npm run play -- wait duel --as Bo --timeout 540                  # block until it's Bo's turn
npm run play -- log duel                                         # the whole game, for the debrief
```

- Games are saved in `playtest/` (ignored by git). Bot seats play their turns automatically.
- The output shows only what the UI shows. It never shows hidden stats or parameter values, so the playtester has to work the rules out, just as a player would.
- Options can be picked by number or by part of their label (an exact label wins, then a word that starts with the text).
- `end` refuses if the player has done nothing this week (the previous week may have ended when time ran out) or if the end-of-week warnings apply (no food, overdue rent). `end!` ends the week anyway.
- Good briefs for agent playtesters: "win against the other agent", "look for exploits", "play as a first-timer and report what was confusing". Ask each for a short report: result, strategy, exploits, pointless places, unclear feedback, top suggestions.
- Content is loaded fresh on every command, so don't change content while a playtest is running.

## 7. Typical loop

1. Change content or numbers.
2. Run `npm run validate`.
3. Run `npm run sim`. If games stall, run `npm run diag`.
4. Fix the structural issues (content, bot hints) by hand, then run `npm run tune` for the fine-tuning.
5. Run `npm run sim -- --seed fresh --games 200` to confirm.
6. Play a hot-seat game. The metrics can't tell you whether it's *fun*.
