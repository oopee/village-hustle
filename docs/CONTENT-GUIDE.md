# Content guide

This guide covers changing the game without touching the engine. Everything below lives in `content/` (rules) or `public/themes/` (graphics).

- `npm run dev` hot-reloads content changes in the browser.
- `npm run validate` prints every error with the file it is in.

> **Spoilers:** keep the actual numbers in `content/balance.json` and refer to them as `params.something`. Only the game master opens that file (see [BALANCING.md](BALANCING.md)). Content designers can add new parameters there without looking at the existing values.

---

## 1. Quick recipes

### Add a location
1. **Add a map node** in `content/map.json`: add a node id to `nodes` and connect it with at least one edge, `["new_node", "existing_node", distance]`.
2. **Create `content/locations/my_place.json`:**
   ```json
   {
     "id": "my_place",
     "name": "Ice Rink",
     "node": "new_node",
     "description": "Cold air and the smell of popcorn.",
     "greeting": ["Skates for rent!", "The Zamboni hums."],
     "actions": [
       {
         "id": "skate", "kind": "basic", "label": "Go skating",
         "time": "params.skateTime", "cost": "params.skatePrice",
         "effects": [
           { "add": { "happiness": "params.skateJoy", "stress": "-5" } },
           { "message": "You skated until your toes went numb." }
         ]
       }
     ]
   }
   ```
3. **Add the parameters** to `content/balance.json`, e.g. `"skateTime": 3`, or `{ "value": 4, "vary": 0.2, "tune": [2, 8] }` if they should vary per game and be tunable.
4. **Optional art**: add a node position and a location entry to the theme (§7). Without art, the place shows as a signpost.
5. **Check the balance**: run `npm run validate`, then `npm run sim`. The simulator reports whether bots use the new place.

### Add an item to a shop
1. **Add it to `content/items.json`:**
   ```json
   { "id": "skis", "name": "Cross-country skis", "category": "gear",
     "price": "params.skisPrice * world.economy", "value": "params.skisPrice * 0.5",
     "wearWeeks": "params.skisWeeks", "weekly": [{ "add": { "happiness": "1" } }] }
   ```
2. **List its id** in a shop action's `items` array.

### Add a job
1. **Add it to `content/jobs.json`.** It needs `location`, `career` (0–100), `wage` per hour and `shift` hours, plus optional `requires`, `hireChance`, `promoteTo` and `onWork`.
2. **Make it workable.** The location needs a `{ "kind": "work" }` action so the player can work there. Any `{ "kind": "jobs" }` action (e.g. the Employment Office) lists all jobs.
3. **Let it pay raises.** End the `wage` with `* payGrade()` (§5.4).
4. **Give it a sound.** Add `action.<location>.work` to the theme's `audio.json` if the location has no work sound yet.

### Add a course
Add a degree and a course in `content/education.json`. The course's `location` must have a `{ "kind": "courses" }` action.

### Add a random event
Add to `content/events.json`:
```json
{ "id": "moose", "weight": "1", "requires": "has('bicycle')",
  "effects": [ { "time": "-4" }, { "message": "A moose blocked the road for hours.", "tone": "bad" } ] }
```

### Change a weekly rule
Edit `content/rules.json` → `turnStart` (it runs for each player at the start of their turn).

---

## 2. Files

| File | What it defines |
|---|---|
| `game.json` | Title, subtitle, theme id, currency symbol, time unit, player limits; `turnTime` (hours per week) and `travelTime` (per walk, sees `distance`) formulas; `startHome`, `startStats`, `startItems`, `world` (global variables), `maxWeeks`, `eventChance`, `maxEnrollments`, `winCheck`, suggested `playerNames`, `intro` paragraphs, `hud` status icons (see below) |
| `stats.json` | Player stats: `id`, `label`, `default`, `min`, `max` (may be an expression), `display` (`money`, `number`, `bar`, `hidden`). `money` is required. Hidden stats are never shown to players. |
| `goals.json` | Goals: `id`, `label`, `score` (expression, clamped to 0–100), `defaultTarget`; `targetMin`/`targetMax` for the setup sliders |
| `map.json` | `nodes` and undirected `edges` `[a, b, distance]`. Walking uses the shortest path. |
| `locations/*.json` | One place per file (§5) |
| `items.json` | Items (§5.3) |
| `jobs.json` | Jobs (§5.4) |
| `education.json` | `degrees` (`id`, `name`, `points`) and `courses` (§5.5) |
| `events.json` | Random events: `weight` (expression), optional `requires`, `effects`. At most one event per turn, with probability `game.eventChance`. |
| `rules.json` | Effect lists run by the engine: `turnStart`, `weekEnd`, `afterWork`, `afterLesson`, `afterMove`; `lessonRequires` (requirements checked before every lesson, e.g. a weekly lesson cap); `turnEndChecks` (requirements checked when a player ends the week, available to tools via `turnEndWarnings()`; the default UI deliberately does not show them, so players find things out for themselves); `hints` (strings for `hint()`) |
| `balance.json` | `params` (§8) |
| `balance-targets.json` | Simulator targets (see BALANCING.md) |
| `ai.json` | Bot `needs` and `profiles` (§9) |
| `rules/*.ts` | Rule code (§6) |

**HUD status icons** (`game.json` → `hud`): small icons in the top bar so players can see at a glance what they have already taken care of. Each entry is `{ "id", "icon", "text", "visible"?, "warn"?, "dim"?, "badge"? }`:
- `icon` is an emoji or short text; `text` is the tooltip (may contain `{expressions}`).
- `visible` (expression, default true) hides the icon when false.
- `warn` makes it blink red (e.g. `"food < 1"`), `dim` greys it out (e.g. not rested yet this week).
- `badge` is a small number in the corner (e.g. `"food"`).

```json
{ "id": "food", "icon": "🍞", "text": "Food at home: {food} weeks", "warn": "food < 1", "badge": "food" }
```

---

## 3. Expressions

Expressions are strings (or plain numbers or booleans) used almost everywhere: costs, times, requirements, effects, formulas.

- **Operators:** `+ - * / %`, comparisons `< <= > >= == !=`, logic `&& || !`, and `cond ? a : b`.
- **Literals:** numbers, `'strings'`, `true` and `false`.
- **Names:**

  | Name | Meaning |
  |---|---|
  | `money`, `happiness`, any stat id | The current player's stat (`player.money` also works) |
  | `job`, `home`, `node`, `location`, `timeLeft`, `name`, `week`, `turnsTaken` | Player fields |
  | `params.x` | A balance parameter (as rolled for this game) |
  | `world.x`, `world.week` | Global world variables (e.g. `world.economy`) |
  | Locals | Context variables (see below) and names set with `let` |

- **Locals by context:**

  | Context | Locals |
  |---|---|
  | Any location action | `cost` (what was paid) |
  | Shop / sell | `item`, `price` |
  | Jobs listing | `jobId`, `wage` |
  | Work | `jobId`, `hours`, `wage`, `pay` (after work) |
  | Courses | `course`, `fee`, `lessons`, `lessonsDone`; in `afterLesson`, set `gain` with `let` to change progress |
  | Transfer | `amount` |
  | `afterMove` | `distance` |
  | Item `weekly` / `value` | `item`, `age` |

- **Built-in functions:**

  | Function | Returns |
  |---|---|
  | `min(a, b, ...)`, `max(...)`, `clamp(x, lo, hi)`, `round(x)`, `floor(x)`, `ceil(x)`, `abs(x)` | Maths |
  | `rnd()`, `randInt(lo, hi)` | Deterministic random numbers |
  | `has('item')`, `qty('item')`, `itemAge('item')` | Inventory |
  | `best('tag')` | Highest value of an item tag among owned items (e.g. `best('clothing') >= 2`) |
  | `itemsValue()` | Total asset value of owned items |
  | `degree('id')`, `degreeCount()`, `degreePoints()` | Education |
  | `enrolled(['course'])`, `progress('course')` | Course state (`enrolled()` without an argument: enrolled in anything) |
  | `jobIs('id')`, `jobCareer(['id'])`, `jobWage(['id'])`, `jobLocation()`, `weeksInJob()`, `canWork('id')` | Jobs (the argument defaults to the current job) |
  | `homeIs('location')` | Where the player lives |
  | `ownedBy('item')` | Names of the *other* players who own the item, or `''`. For one-of-a-kind things: `"requires": [{ "test": "ownedBy('cottage_deed') == ''", "message": "{ownedBy('cottage_deed')} owns it now." }]` |
  | `flag('name')` | A per-player flag set with `setFlag` (0 if unset) |
  | `statMax('stat')`, `turns()`, `hint()` | Misc |
  | Rule-code functions | Anything a rule module adds (§6). The default `rules/core.ts` adds `season()` (`'summer'`, `'autumn'`, `'winter'` or `'spring'`; week 1 is early June, 13 weeks each, e.g. `"requires": "season() == 'winter'"`), `rentDueMonths()`, and `shifts()`, `raises()` and `payGrade()` (§5.4) |

- **Text interpolation.** Messages, requirement messages and greetings may contain `{expression}`, e.g. `"You lost €{lost}."`.
- **Validation.** The validator rejects unknown names, parameters, functions and syntax errors, and names the file they are in.

---

## 4. Effects

Effects are JSON objects run in order:

| Effect | Meaning |
|---|---|
| `{ "add": { "stat": "expr", ... } }` | Add to stats (clamped to min/max) |
| `{ "set": { "stat": "expr" } }` | Set stats |
| `{ "let": { "name": "expr" } }` | Set a local variable for the following effects/messages |
| `{ "setWorld": { "key": "expr" } }` | Set a world variable (declare it in `game.json` `world`). The default rules keep `world.economy` and `world.market`, the share price move of the week, which `turnStart` applies to each player's `shares` |
| `{ "setFlag": { "name": "expr" } }` | Set a per-player flag (number, string or boolean) |
| `{ "give": "item", "qty": "expr" }` / `{ "take": ... }` | Inventory |
| `{ "message": "text {expr}", "tone": "good" \| "bad" \| "info" }` | Show a message (narration caption) |
| `{ "say": "text {expr}", "tone": ... }` | The location's owner says it, in a speech bubble (see 5.6) |
| `{ "if": "expr", "then": [...], "else": [...] }` | Condition |
| `{ "chance": "expr", "then": [...], "else": [...] }` | Random with probability |
| `{ "pick": [ { "weight": "expr", "do": [...] }, ... ] }` | Weighted random choice |
| `{ "time": "expr" }` | Add (or with negative, remove) hours this turn |
| `{ "setJob": "id" \| null }`, `{ "setHome": "location" }`, `{ "grantDegree": "id" }`, `{ "moveTo": "node" }` | State changes. `grantDegree` also drops any enrollment in a course for that degree (used by the skills tests at the school) |
| `{ "call": "effectName", "args": { "k": "expr" } }` | Run a rule-code effect |
| `{ "endTurn": true }` | End the turn after this action |

**Once-per-week pattern:**
```json
"requires": [{ "test": "flag('saunaWeek') != player.week", "message": "You already went this week." }],
"effects": [{ "setFlag": { "saunaWeek": "player.week" } }, ...]
```

---

## 5. Locations and actions

**Location fields:**
- `id`, `name`, `node` (map node)
- `description`, `greeting` (random narration line shown on entering)
- `host` (the owner; see 5.6)
- `openIf` (expression) and `closedText`
- `onArrive` (effects)
- `actions`

**Common action fields:**
- `id`, `kind`, `label`, `description`
- `visible`: an expression; when false the action is hidden
- `time`, `cost`
- `requires`: a list of `{ "test": "expr", "message": "why not" }`. Unmet requirements show greyed out with the reason. Use them for real rules (once a week, prerequisites), not to protect players from wasting time: if an action is merely pointless (eating when full, a doctor when healthy), let it run and say so in an `if` effect instead.
- `effects`: run after the built-in behaviour
- `ai`: an extra desirability hint for bots; an expression, positive is more attractive

### 5.1 Action kinds

| Kind | Built-in behaviour | Extra fields |
|---|---|---|
| `basic` | None; just `time`, `cost` and `effects` | — |
| `shop` | One option per item; pays the item price and runs `onBuy` (consumables) or adds the item to the inventory | `items: [...]` |
| `sell` | Sell owned items of the given categories for their `sellValue` | `categories: [...]` |
| `jobs` | One option per job (all jobs, or listed ones). Every job can be applied for; the job's `requires` are checked only on applying, and an unqualified application costs the action's time and is rejected with the first unmet message. Otherwise it rolls `hireChance`. The UI groups vacancies by workplace | `jobs?: [...]` |
| `work` | Shown only if the player's job is at this location; works one shift (or the hours left) and pays `wage × hours`; runs `job.onWork`, then `rules.afterWork` | — |
| `courses` | Enroll in courses taught here (pay the fee), or attend a lesson of an enrolled course; the final lesson grants the degree | `courses?: [...]` |
| `transfer` | Move amounts between two stats (e.g. bank) | `from`, `to`, `amounts`, `allowAll` |

### 5.2 Homes
- A home is just a location id stored as the player's `home`. Turns start there.
- Rent, nagging and similar rules live in `rules.json` → `turnStart`, using `homeIs('...')`.
- To add a new home type, use a `basic` action with `{ "setHome": "my_place" }` plus rules for its upkeep.
- **Default content:** everyone starts at the parents' house (free food, but Mom's chores eat time and happiness every week). Players may move out to the cheap basement flat or the better flat at Lasitehtaantie, rent the cottage, or buy it. The rent is locked in with the lease (`setFlag rent`) and charged **monthly**; `flag('basement')` marks the cheap flat.
- The player's own items are drawn in their home if the theme has `furniture` for it (§7).

### 5.3 Items
- **Required fields:** `id`, `name`, `category`, `price`.
- **Optional fields:**

  | Field | Meaning |
  |---|---|
  | `consumable` | If true, the item isn't kept; only `onBuy` runs |
  | `max` | How many the player can own (default 1) |
  | `tags` | Numeric tags read with `best()`, e.g. `{ "clothing": 2 }` |
  | `wearWeeks` | Weeks until it wears out |
  | `value` | Counts toward wealth |
  | `sellValue` | Price when sold back |
  | `requires` | Requirements to buy |
  | `onBuy` | Effects when bought |
  | `weekly` | Effects at each of the owner's turns |
  | `wornOutText` | Message when it wears out |
  | `time` | Overrides the shop's time |
  | `ai` | Hint for bots |

### 5.4 Jobs
- **Fields:** `id`, `title`, `location`, `description`, plus:

  | Field | Meaning |
  |---|---|
  | `career` | Career rating; feeds the Career goal |
  | `wage` | Pay per hour. Multiply by `payGrade()` so raises apply: `"params.wage_x * params.wageScale * world.economy * payGrade()"` |
  | `shift` | Hours per shift |
  | `requires` | Requirements to be hired |
  | `openings` | Optional expression: how many players can hold the job at once. When it is full, an application is rejected with "The position is already taken (name)" and `canWork()` is false. Omit for unlimited. |
  | `hireChance` | Probability that an application succeeds |
  | `rejectText` | Message when not hired |
  | `promoteTo` | Job id of the next step up; promotions are rule code in `rules/core.ts` (see below) |
  | `onWork` | Effects after each shift |

- **Experience** grows through `rules.afterWork`; requirements can test it. The default rules keep general experience in the `experience` stat and experience per workplace in flags (`flag('xpBank')`, `flag('xpHealth')`, `flag('xpBand')` etc.), so a manager job can ask for experience at its own workplace.
- **Raises and promotions** (`rules/core.ts`). `rules.afterWork` calls `{ "call": "countShift", "args": { "hours": "hours" } }`, which counts shifts in the current job (a shift shorter than the job's `shift` counts partly) and announces each raise. Hiring or promotion starts the count again.
  - `shifts()`: shifts in the current job. `raises()`: raises earned, one per `params.raiseShifts`, at most `params.maxRaises`. `payGrade()`: the wage multiplier, `1 + params.raiseStep * raises()`; it is 1 when another job's wage is being shown.
  - At the start of a week, a player with at least `params.promotionShifts` shifts in a job with `promoteTo` is promoted with `params.promotionChance` (more with reputation) if `canWork()` the next job. If not, the boss names the first unmet requirement once per job.
  - The Career goal adds `raises() * params.seniorityCareer`.
- **Experience instead of a diploma.** Write the requirement as an "or": `"degree('vocational_trade') || flag('xpGrill') >= params.exp_grill_manager * params.veteranXp"`, with a message that names both ways ("You need a Retail & Trade diploma, or a lot more experience at the grill.").
- **Jobs you get without applying.** An item's `onBuy` can `setJob` (the beach kiosk lease). Give the job a `requires` that checks the item, so applying for it elsewhere explains how to get it.

### 5.5 Courses
- **Fields:** `id`, `name`, `location`, `degree`, `description`, plus:

  | Field | Meaning |
  |---|---|
  | `fee` | Paid on enrolling |
  | `lessons` | Number of lessons |
  | `lessonTime` | Hours per lesson |
  | `requires` | Requirements to enrol |
  | `onLesson` | Effects after each lesson |
  | `onComplete` | Effects when the degree is granted |

- **Enrolment limit:** `game.maxEnrollments` limits how many courses a player can take at once.

### 5.6 Hosts (owners and speech bubbles)
Every location can have an owner who stands in the interior picture and reacts to what the player does. Hosts are pure flavour: the engine ignores `lines`, only the UI reads them.

```json
"host": {
  "name": "Veikko", "title": "runs the ice rink",
  "lines": {
    "hello": ["Skates are by the door.", "Mind the thin ice, friend."],
    "buy": ["Enjoy!"],
    "skate": ["Look at you go!"],
    "broke": ["That's a euro short."],
    "refuse": ["Not today."]
  }
}
```

**How a line is chosen** (one random line from the list):
1. If the action's effects used `say`, those words are spoken.
2. Otherwise `lines[<option id>]`, e.g. the item bought (`"lines": { "groceries": [...] }`).
3. Otherwise `lines[<action id>]` (e.g. `skate`).
4. Otherwise a line for the action kind:

   | Kind | Situation key |
   |---|---|
   | `shop` | `buy` |
   | `work` | `work` |
   | `jobs` | `hired` / `rejected` |
   | `courses` | `enroll` / `lesson` / `graduate` |
   | `sell` | `sell` |
   | `transfer` | `money` (or use the action ids, e.g. `deposit`) |

5. Otherwise the host only reacts with a face: happy after good news, annoyed after bad news.

**Other keys:**
- `hello`: on entering.
- `broke`: clicking a greyed-out choice the player can't afford.
- `refuse`: clicking any other greyed-out choice.

Regular `message`s still appear as narration captions under the picture. Use `say` when the owner should speak, e.g. advice: `{ "say": "{tip}" }`. The art for the host (sprite sheet and animations) comes from the theme (section 7).

If the theme draws a **regular** (an `extras` entry) whose id equals an action id at that location (e.g. `pekki` at the grill), doing that action makes the regular chat and react instead of the owner.

### 5.7 Pokes (clickable things in a room)
Pure flavour for the curious: the cat, a cuckoo clock, the regular at the corner table. Keys are the ids of the theme's `props` or `extras` in this interior (section 7). Clicking shows one random line in a bubble pointing at the thing; nothing in the game changes and no time passes.

```json
"pokes": {
  "cat": { "name": "Mirri", "lines": ["Mrrrp.", "Mau. (Translation: the bowl is half empty.)"] },
  "clock": { "lines": ["The cuckoo clock has said a quarter past something since 1987."] }
}
```

- With a `name`, the line is spoken: the name is shown and the speaker babbles with the voice `voices.<id>` from `audio.json`, if there is one.
- Without a name, the line is narration pointing at the prop.
- The sound `poke.<location>.<id>` from `audio.json` plays on every click.
- A prop or regular without a `pokes` entry is not clickable.

---

## 6. Rule code (`content/rules/*.ts`)

For anything JSON can't express cleanly. Every file in `content/rules/` that default-exports `defineRules({...})` is loaded automatically, both in the browser and in the simulator.

```ts
import { defineRules } from '../../src/engine/rules-api';

export default defineRules({
  id: 'winter',
  // usable in any expression: "isWinter() ? 2 : 1"
  functions: {
    isWinter: (ctx) => ctx.state.week % 52 >= 44 || ctx.state.week % 52 < 10,
  },
  // usable from JSON: { "call": "slipOnIce", "args": { "chance": "0.2" } }
  effects: {
    slipOnIce: (ctx, args) => {
      if (ctx.random() < Number(args.chance)) {
        ctx.player.stats.health -= 10;
        ctx.message('You slipped on the ice!', 'bad');
      }
    },
  },
  onTurnStart(ctx) { /* after rules.turnStart, from the 2nd turn */ },
  onTurnEnd(ctx) {},
  onWeekEnd(ctx) { /* once per week after everyone played */ },
  afterAction(ctx, info) { /* info.location, info.action, info.option */ },
});
```

**Rules for rule code:**
- Change state only through `ctx` (`ctx.player`, `ctx.state`).
- Use `ctx.random()`, never `Math.random()`. Never use time, network or DOM APIs.
- Read numbers with `ctx.num('params.x')`, not hard-coded constants, so they stay tunable and hidden.
- Keep it deterministic. Saves, the simulator and future network play depend on it.
- If your effects set new local variable names, list them in `locals: [...]` so the validator accepts them.

---

## 7. Themes (graphics)

A theme is `public/themes/<id>/theme.json` plus images. `content/game.json` → `theme` selects it. The engine never sees the theme, so graphics can be replaced freely.

```jsonc
{
  "name": "Ryttylä (placeholder)",
  "width": 640, "height": 360,               // map size in pixels
  "background": "background.png",
  "nodes": { "parents_house": [100, 120], ... },   // pixel position of every map node (walking path)
  "foreground": "foreground.png",            // optional: drawn over buildings and the player (tree tops, eaves)
  "nodes": { ... },
  "locations": {
    "parents_house": { "sprite": "buildings/parents_house.png", "x": 34, "y": 68,
                       "interior": "interiors/parents_house.png",        // the room shown in the panel
                       "interiorFront": "interiors/parents_house-front.png", // optional: drawn over the host (counter)
                       "host": { "sprite": "hosts/parents_house.png", "frameWidth": 32, "frameHeight": 48,
                                 "x": 110, "y": 60,                     // top-left inside the interior
                                 "anims": { "idle": [0, 1], "talk": [2, 3], "happy": [4], "annoyed": [5] } },
                       // optional regulars, drawn like the host; id = content action id / pokes key
                       "extras": [{ "id": "pekki", "sprite": "hosts/extras-pekki.png", "frameWidth": 32, "frameHeight": 48,
                                    "x": 20, "y": 70, "anims": { ... }, "flip": false, "front": true }],
                       // optional: the player's own things, shown only when this is their home and they own the item
                       "furniture": { "tv": { "sprite": "furniture/tv.png", "x": 166, "y": 34, "front": false } },
                       // optional: clickable hit areas (content pokes say what happens)
                       "props": [{ "id": "cat", "x": 24, "y": 96, "w": 20, "h": 16 }] }
  },
  "interiorSize": [256, 160],                // pixel size of all interiors
  "overlays": [                              // animated decorations: horizontal frame strips
    { "sprite": "overlays/0.png", "x": 300, "y": 200, "frameWidth": 16, "frameHeight": 16, "frames": 4, "fps": 3, "above": false }
  ],
  "player": { "sprite": "player.png", "frameWidth": 16, "frameHeight": 24, "frames": 12,
              "tintKey": "#ff00ff", "tintShadeKey": "#c000c0",  // these colours are recoloured per player
              "directions": { "down": [0, 1, 0, 2], "up": [3, 4, 3, 5], "left": [6, 7, 6, 8], "right": [9, 10, 9, 11] } },
  "playerColors": ["#d83a3a", ...], "playerColorNames": ["Red", ...],
  "ui": { "font": "VT323", "panel": "#f3ead2", "border": "#3a2a1e", "text": "#2a1d14", "accent": "#9e2f22", ... }
}
```

- **Map layer:** the map is drawn at 640×360 and scaled with nearest-neighbour filtering. Use pixel art at 1×.
- **Hit-testing:** clicking uses each building sprite's opaque pixels. Hover outlines are generated automatically.
- **Missing art:** a location without a `locations` entry or sprite shows as a signpost at its node. Missing nodes or sprites show warnings in the browser console.
- **Player tinting:** draw the player sheet with the two magenta key colours wherever the player colour should go.
- **Walking:** `directions` lists frames per walking direction; the first one is the standing pose. Without it, the frames are mirrored for walking left.
- **Hosts:** the host sheet is a horizontal strip of frames. Animations missing from `anims` fall back to `idle`. The speech bubble is placed above the host automatically.
- **Interior draw order:** interior → furniture → host → extras → `interiorFront` → furniture and extras with `front: true` → speech bubble.
- **Furniture** is keyed by item id. It shows only in the current player's own home, so the same item can have a different position in each home.
- **Seasons and daylight** are drawn by the UI on top of the map art: week 1 is early June, each season lasts 13 weeks, greens are recoloured for autumn, winter and spring, and the map darkens towards evening as the week's hours run out. No extra art is needed.
- **UI colours:** the `ui` colours become CSS variables (`--panel`, `--accent`, ...).

**To make a new theme:**
1. Copy `public/themes/ryttyla` to `public/themes/my-theme`.
2. Replace the images.
3. Edit the coordinates in `theme.json`.
4. Set `"theme": "my-theme"` in `game.json`.

**Placeholder art:** `npm run art` regenerates the Ryttylä theme. It overwrites `public/themes/ryttyla/`.
- `tools/art/map.ts` draws the village map, buildings, overlays and the player.
- `tools/art/rooms.ts` draws the interiors and owners.
- `tools/art/types.ts` is the contract between them.
- `tools/gen-art.ts` saves everything and writes `theme.json`.

To preview while editing, run `npx tsx tools/art/preview.ts map <dir>` (or `rooms <dir>`). It writes enlarged PNGs.

### Sound and music
A theme's audio lives next to its art:
- `audio.json` maps screens and locations to songs, events and actions to sound effects, and owners to voices.
- `audio/songs/*.json` holds the songs, written in a small text notation.
- Optionally, `audio/` can hold `.wav`, `.ogg` or `.mp3` files that you reference by file name.

When you add a location, give it a `music.locations` entry, a voice and `action.<loc>.<action>` sounds. If you skip any of these, the place falls back to the map music, generic sounds, or silence. `npm run audio` checks the file, and the test suite checks that every location is covered. See [AUDIO-GUIDE.md](AUDIO-GUIDE.md) for the notation, instruments, effects and lookup rules.

---

## 8. Balance parameters (`balance.json`)

```json
"params": {
  "skateTime": 3,
  "skatePrice": { "value": 12, "vary": 0.15, "round": true, "tune": [5, 25], "note": "Ice rink ticket" }
}
```
*(A made-up example, not real game values.)*

| Field | Meaning |
|---|---|
| `value` | Base value |
| `vary` | Random ± fraction per game when "Shuffle the rules a little" is on |
| `round` | Round to whole numbers after variation |
| `tune` | `[min, max]` range the auto-tuner may search. Omit it to keep the value fixed. |
| `note` | Free text |

Refer to parameters only as `params.name`. Never copy their values into other files.

---

## 9. Computer players (`ai.json`)

- **`needs`** are extra terms in a bot's evaluation, beyond the goals: `{ "id", "value": "expr", "weight" }`. Examples are "have food", "pay rent" and "keep clothes".
  - When you add a mechanic that bots ignore or misuse, add a need, or an `ai` hint on the action or item.
- **`profiles`** are strategies: `goals` (a weight per goal id), `caution` (multiplier for needs), `randomness` (0 always plays the best move; 1 often picks from the top few).
- **Bots are generic.** They try every available option, simulate it, and pick the best value per hour. New content is usually played sensibly without code changes.
- **To see what bots do:** run `npm run sim` (location and action usage, unused locations) and `npm run diag` (where bots get stuck).
